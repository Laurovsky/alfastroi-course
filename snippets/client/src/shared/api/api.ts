import { getApiRequestTransport } from './requestTransport';
import { supabase } from './supabase';
import { ConflictError, ForbiddenError } from './rpc';
import { reportHttpAnomaly } from '@/shared/lib/sentry';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_FALLBACK_URL =
  import.meta.env.VITE_API_FALLBACK_URL ||
  (API_URL === 'https://api.example.com' ? 'https://legacy.example.com' : '');

function apiBaseUrls(): string[] {
  return API_FALLBACK_URL && API_FALLBACK_URL !== API_URL ? [API_URL, API_FALLBACK_URL] : [API_URL];
}

/**
 * Railway free/starter plan усыпляет контейнер после ~15 минут idle.
 * Первый запрос после wake-up может идти 30-60 секунд (cold start).
 * Поэтому: timeout 45с + одна авто-попытка повторно при TimeoutError
 * (после первого timeout контейнер уже проснулся).
 */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Таймаут на supabase.auth.getSession() / refreshSession().
 *
 * supabase-js v2 защищает auth state глобальным mutex. Если refreshSession()
 * висит на мёртвом TCP-соединении (типичный сценарий: вкладка ушла в фон,
 * браузер заморозил таймеры, TCP socket уехал — supabase-js этого не знает
 * и продолжает ждать ответа), lock держится бесконечно. ВСЕ последующие
 * getSession() и refreshSession() становятся в очередь за ним → весь
 * apiFetch висит ровно 45 секунд (наш глобальный timeout), даже не успев
 * отправить запрос. Симптом: в консоли есть `→ start` и сразу `TIMEOUT`,
 * без `getSession=...ms` между ними.
 *
 * Лечим коротким timeout на сами операции с auth: если supabase не
 * отвечает за 3s — читаем сессию из localStorage напрямую, минуя mutex.
 */
const SESSION_OP_TIMEOUT_MS = 3000;

function getSupabaseStorageKey(): string {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const ref = url.match(/https?:\/\/([^.]+)\./)?.[1] ?? '';
  return `sb-${ref}-auth-token`;
}

interface StoredSupabaseSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

function readSessionFromStorage(): StoredSupabaseSession | null {
  try {
    const raw = localStorage.getItem(getSupabaseStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // supabase-js v2 хранит { currentSession: {...} } либо плоско — оба формата
    if (parsed?.currentSession) return parsed.currentSession;
    return parsed;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    )
  ]);
}

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Превышено время ожидания (${Math.round(timeoutMs / 1000)} с)`);
    this.name = 'TimeoutError';
  }
}

/** HTTP metadata for scoped cache eviction; existing message remains unchanged. */
export class ApiHttpError extends Error {
  status: number;
  code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Нормализует ключ один раз для всей логической POST-операции. Поэтому retry
 * после таймаута использует тот же ключ и сервер отдаёт закэшированный ответ.
 */
export function withAutomaticIdempotencyKey(options: ApiFetchOptions): ApiFetchOptions {
  const headers = new Headers(options.headers);
  if ((options.method ?? 'GET').toUpperCase() === 'POST' && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', crypto.randomUUID());
  }
  return { ...options, headers };
}

/**
 * Безопасно ли авто-ретраить запрос после TimeoutError?
 *
 * Ретрай вслепую пересылает ТОТ ЖЕ запрос. Это безвредно только если запрос
 * либо без побочных эффектов (GET/HEAD), либо защищён от дублей на сервере
 * (Idempotency-Key → middleware вернёт кэш первого ответа). Для «голых» POST
 * без ключа, и особенно PATCH (version-check → ложный 409) и DELETE (RPC
 * RAISE «not found» → ложная 500) ретрай рождает фантомные ошибки: первый
 * запрос успел отработать на сервере, ответ не дошёл за 45с, повтор бьёт по
 * уже изменённому состоянию. Такие НЕ ретраим (см. миграцию 049 — где
 * delete_additional_act ловил ровно этот сценарий).
 */
function hasIdempotencyKey(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has('Idempotency-Key');
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === 'idempotency-key');
  return Object.keys(headers).some((k) => k.toLowerCase() === 'idempotency-key');
}

function isRetriableOnTimeout(options: ApiFetchOptions): boolean {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;
  return hasIdempotencyKey(options.headers);
}

/**
 * Обёртка над fetch:
 * - JWT proactive refresh при <60с до expiry
 * - 401 → один retry с refreshSession + same request
 * - TimeoutError → один retry ТОЛЬКО для идемпотентных запросов (GET/HEAD или
 *   с Idempotency-Key): Railway cold start: первый запрос разбудит, второй
 *   сработает. Не-идемпотентные PATCH/DELETE/POST без ключа не ретраим —
 *   первый запрос мог уже отработать на сервере (см. isRetriableOnTimeout).
 * - 403/409 → специализированные исключения
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const transport = getApiRequestTransport();
  if (transport?.matches(path, options))
    return (await transport.write(path, options, rawApiFetch)) as T;
  const result = await rawApiFetch<T>(path, options);
  transport?.observe(path, result);
  return result;
}

async function rawApiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const normalizedOptions = withAutomaticIdempotencyKey(options);
  try {
    return await singleAttempt<T>(path, normalizedOptions, false);
  } catch (e) {
    if (e instanceof TimeoutError && isRetriableOnTimeout(normalizedOptions)) {
      console.warn(`[apiFetch ${path}] TimeoutError → auto-retry once`);
      return await singleAttempt<T>(path, normalizedOptions, true);
    }
    throw e;
  }
}

async function singleAttempt<T>(
  path: string,
  options: ApiFetchOptions,
  isRetry: boolean
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...rest } = options;
  const fetchController = new AbortController();
  const startMs = performance.now();
  const tag = `[apiFetch ${rest.method ?? 'GET'} ${path}${isRetry ? ' RETRY' : ''}]`;

  if (externalSignal) {
    if (externalSignal.aborted) fetchController.abort(externalSignal.reason);
    else
      externalSignal.addEventListener('abort', () => fetchController.abort(externalSignal.reason), {
        once: true
      });
  }

  const REFRESH_THRESHOLD_S = 60;

  async function getValidToken(): Promise<string | undefined> {
    let accessToken: string | undefined;
    let expiresAtMs: number | null = null;

    try {
      const {
        data: { session }
      } = await withTimeout(supabase.auth.getSession(), SESSION_OP_TIMEOUT_MS, 'getSession');
      accessToken = session?.access_token;
      expiresAtMs = session?.expires_at ? session.expires_at * 1000 : null;
    } catch {
      const stored = readSessionFromStorage();
      accessToken = stored?.access_token;
      expiresAtMs = stored?.expires_at ? stored.expires_at * 1000 : null;
      console.warn(`${tag} supabase.getSession() hung → fallback localStorage`);
    }

    const expiresIn = expiresAtMs ? Math.round((expiresAtMs - Date.now()) / 1000) : null;
    if (accessToken && expiresIn !== null && expiresIn < REFRESH_THRESHOLD_S) {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.refreshSession(),
          SESSION_OP_TIMEOUT_MS,
          'refreshSession'
        );
        if (error) console.warn(`${tag} refreshSession failed`, error);
        else if (data.session?.access_token) accessToken = data.session.access_token;
      } catch {
        console.warn(`${tag} supabase.refreshSession() hung → using current token`);
      }
    }

    return accessToken;
  }

  async function actualFetch(authRetried = false): Promise<T> {
    const token = await getValidToken();
    let res: Response;
    const bases = apiBaseUrls();
    for (let i = 0; i < bases.length; i += 1) {
      const base = bases[i];
      try {
        const headers = new Headers(rest.headers);
        // FormData: браузер сам ставит Content-Type + boundary.
        if (!(rest.body instanceof FormData) && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        headers.set('Cache-Control', 'no-cache');
        headers.set('Pragma', 'no-cache');
        if (token) headers.set('Authorization', `Bearer ${token}`);
        res = await fetch(`${base}${path}`, {
          ...rest,
          signal: fetchController.signal,
          // cache: 'no-store' + keepalive: false — защита от зависшего
          // keep-alive socket: после долгой паузы TCP-соединение могут закрыть
          // промежуточные хопы или OS, а браузер не успевает заметить и пытается
          // переиспользовать его. Свежий запрос → свежее соединение → ответ доходит.
          cache: 'no-store',
          keepalive: false,
          headers
        });
        break;
      } catch (e) {
        if (i === bases.length - 1 || fetchController.signal.aborted) throw e;
        console.warn(`${tag} ${base} failed → fallback API`, e);
      }
    }

    if (!res!.ok) {
      const body = await res!.json().catch(() => ({}));
      // 409/429 — сигнатура инцидента «зомби-клиент в цикле» (2026-06-16/22,
      // 07-03): телеметрия в Sentry (троттлится внутри, штатные одиночные
      // конфликты почти ничего не стоят).
      reportHttpAnomaly(res!.status, rest.method ?? 'GET', path);
      if (res!.status === 401 && !authRetried) {
        try {
          const { error } = await withTimeout(
            supabase.auth.refreshSession(),
            SESSION_OP_TIMEOUT_MS,
            'refreshSession(401)'
          );
          if (error) throw new Error(body.error || 'Unauthorized');
        } catch {
          throw new Error(body.error || 'Unauthorized');
        }
        return actualFetch(true);
      }
      if (res!.status === 403) throw new ForbiddenError(body.error);
      if (res!.status === 409) throw new ConflictError(body.error);
      throw new ApiHttpError(
        body.error || `HTTP ${res!.status}`,
        res!.status,
        typeof body.code === 'string' ? body.code : undefined
      );
    }

    if (res!.status === 204 || res!.headers.get('content-length') === '0') {
      return undefined as unknown as T;
    }
    return res!.json();
  }

  if (timeoutMs <= 0) {
    return actualFetch();
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.warn(`${tag} timeout after ${Math.round(performance.now() - startMs)}ms`);
      fetchController.abort(new TimeoutError(timeoutMs));
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([actualFetch(), timeoutPromise]);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      const reason = fetchController.signal.reason;
      if (reason instanceof TimeoutError) throw reason;
      throw e;
    }
    throw e;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Достаёт access-token максимально устойчиво: getSession с 3s-таймаутом,
 * при зависании mutex'а supabase-js — fallback на localStorage (см. §14).
 */
async function getAccessTokenSafe(): Promise<string | undefined> {
  try {
    const {
      data: { session }
    } = await withTimeout(supabase.auth.getSession(), SESSION_OP_TIMEOUT_MS, 'getSession');
    return session?.access_token;
  } catch {
    return readSessionFromStorage()?.access_token;
  }
}

/** Имя файла из Content-Disposition (поддержка filename*=UTF-8''…). */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* ignore */
    }
  }
  const plain = header.match(/filename="([^"]+)"/i);
  return plain ? plain[1] : null;
}

/**
 * GET-скачивание бинарного файла (xlsx и т.п.) с JWT-авторизацией.
 * При !ok парсит JSON-ошибку и бросает Error(body.error).
 *
 * Таймаут — тот же fail-fast паттерн, что у apiFetch (§14): AbortController +
 * DEFAULT_TIMEOUT_MS, TimeoutError при истечении. GET идемпотентен, но
 * авто-ретрай здесь не нужен (скачивание — явное действие пользователя).
 */
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const token = await getAccessTokenSafe();
  const fetchController = new AbortController();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new TimeoutError(DEFAULT_TIMEOUT_MS);
      fetchController.abort(err);
      reject(err);
    }, DEFAULT_TIMEOUT_MS);
  });

  let res: Response;
  try {
    res = await Promise.race([
      fetch(`${API_URL}${path}`, {
        method: 'GET',
        cache: 'no-store',
        signal: fetchController.signal,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      }),
      timeoutPromise
    ]);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      const reason = fetchController.signal.reason;
      if (reason instanceof TimeoutError) throw reason;
      throw e;
    }
    throw e;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const filename =
    filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * POST multipart (FormData) → скачивание бинарного ответа (xlsx).
 * Аналог apiDownload, но метод POST с телом-FormData. Без авто-ретрая
 * (не-идемпотентный POST без ключа). Content-Type ставит браузер (boundary).
 */
export async function apiUploadDownload(
  path: '/api/tkp-compare/export.xlsx',
  formData: FormData,
  fallbackFilename: string
): Promise<void> {
  const token = await getAccessTokenSafe();
  const fetchController = new AbortController();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new TimeoutError(DEFAULT_TIMEOUT_MS);
      fetchController.abort(err);
      reject(err);
    }, DEFAULT_TIMEOUT_MS);
  });

  let res: Response;
  try {
    res = await Promise.race([
      fetch(`${API_URL}${path}`, {
        method: 'POST',
        cache: 'no-store',
        signal: fetchController.signal,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData
      }),
      timeoutPromise
    ]);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      const reason = fetchController.signal.reason;
      if (reason instanceof TimeoutError) throw reason;
      throw e;
    }
    throw e;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const filename =
    filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
