import type { Exercise } from '@/entities/exercise/model/types';
import { call, get } from './helpers';

type Res = { statusCode: number; body: unknown; status(code: number): Res; json(body: unknown): Res };
function fakeRes(): Res {
  const res: Res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

type Middleware = (req: unknown, res: Res, next: () => void) => void;
function runMiddleware(mw: Middleware, req: unknown) {
  const res = fakeRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

export const requireRole: Exercise = {
  id: 'require-role',
  title: 'requireRole: фабрика middleware',
  task: `В Express middleware — это функция (req, res, next). Чтобы закрыть роут по ролям, проект использует фабрику: requireRole('engineer', 'supervisor') возвращает middleware.

Напишите requireRole(...roles):
• если req.user нет или его роль не входит в roles → ответить res.status(403).json({ error: 'Недостаточно прав' }) и НЕ вызывать next;
• иначе — вызвать next().

req.user заранее кладёт authMiddleware (после проверки JWT).`,
  exports: ['requireRole'],
  starter: `function requireRole(...roles) {
  return (req, res, next) => {
    next()
  }
}
`,
  solution: `function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Недостаточно прав' })
      return
    }
    next()
  }
}
`,
  hints: ['requireRole возвращает функцию — это замыкание над roles.', 'После ответа 403 сделайте return, чтобы не вызвать next.'],
  tests: [
    {
      name: 'нужная роль → next()',
      run: (api, expect) => {
        const mw = call(api, 'requireRole', 'engineer', 'supervisor') as Middleware;
        expect(runMiddleware(mw, { user: { id: 'u1', role: 'supervisor' } }).nextCalled).toBe(true);
      },
    },
    {
      name: 'чужая роль → 403 без next',
      run: (api, expect) => {
        const mw = call(api, 'requireRole', 'engineer') as Middleware;
        const { res, nextCalled } = runMiddleware(mw, { user: { id: 'u2', role: 'foreman' } });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: 'Недостаточно прав' });
      },
    },
    {
      name: 'нет пользователя → 403',
      run: (api, expect) => {
        const mw = call(api, 'requireRole', 'admin') as Middleware;
        expect(runMiddleware(mw, {}).res.statusCode).toBe(403);
      },
    },
  ],
};

type Store = {
  reserve(i: { key: string; userId: string; endpoint: string; requestHash: string }): { state: string; response?: unknown };
  complete(i: { key: string; userId: string; status: number; body: unknown }): void;
};

const store = (api: Record<string, unknown>) => call(api, 'createIdempotencyStore') as Store;
const req = { key: 'k-123456789', userId: 'u1', endpoint: '/api/analyses', requestHash: 'h1' };

export const idempotencyStore: Exercise = {
  id: 'idempotency-store',
  title: 'Хранилище Idempotency-Key',
  task: `Сеть мобильного прораба нестабильна: POST «Отправить пакет» может уйти дважды. Сервер защищается ключом идемпотентности. В проекте это делают функции reserve_idempotency_key / complete_idempotency_key в Postgres; здесь — версия в памяти.

createIdempotencyStore() возвращает объект с методами:

reserve({ key, userId, endpoint, requestHash }) → { state, response? }
• ключа (key+userId) ещё нет → запомнить и вернуть { state: 'reserved' } — можно выполнять запрос;
• ключ есть, запрос ещё выполняется → { state: 'in_progress' } (сервер ответит 409);
• ключ есть, ответ сохранён → { state: 'completed', response: { status, body } } — вернуть кэш, не выполняя повторно;
• ключ есть, но endpoint другой → { state: 'endpoint_mismatch' }; тело другое (requestHash) → { state: 'body_mismatch' } (сервер ответит 422).

complete({ key, userId, status, body }) — сохранить ответ.

Ключ принадлежит пользователю: одинаковый key у двух разных userId — разные записи.`,
  exports: ['createIdempotencyStore'],
  starter: `function createIdempotencyStore() {
  const records = new Map()
  return {
    reserve({ key, userId, endpoint, requestHash }) {
      return { state: 'reserved' }
    },
    complete({ key, userId, status, body }) {},
  }
}
`,
  solution: `function createIdempotencyStore() {
  const records = new Map()
  const id = (key, userId) => userId + ':' + key
  return {
    reserve({ key, userId, endpoint, requestHash }) {
      const rec = records.get(id(key, userId))
      if (!rec) {
        records.set(id(key, userId), { endpoint, requestHash, response: null })
        return { state: 'reserved' }
      }
      if (rec.endpoint !== endpoint) return { state: 'endpoint_mismatch' }
      if (rec.requestHash !== requestHash) return { state: 'body_mismatch' }
      if (!rec.response) return { state: 'in_progress' }
      return { state: 'completed', response: rec.response }
    },
    complete({ key, userId, status, body }) {
      const rec = records.get(id(key, userId))
      if (rec) rec.response = { status, body }
    },
  }
}
`,
  hints: [
    'Составной ключ записи: userId + ":" + key.',
    'Порядок проверок важен: сначала mismatch (это ошибка клиента), потом in_progress/completed.',
  ],
  tests: [
    { name: 'первый запрос резервирует ключ', run: (api, expect) => expect(store(api).reserve(req).state).toBe('reserved') },
    {
      name: 'повтор во время выполнения → in_progress',
      run: (api, expect) => {
        const s = store(api);
        s.reserve(req);
        expect(s.reserve(req).state).toBe('in_progress');
      },
    },
    {
      name: 'повтор после ответа → кэш',
      run: (api, expect) => {
        const s = store(api);
        s.reserve(req);
        s.complete({ key: req.key, userId: req.userId, status: 201, body: { id: 'a1' } });
        expect(s.reserve(req)).toEqual({ state: 'completed', response: { status: 201, body: { id: 'a1' } } });
      },
    },
    {
      name: 'тот же ключ с другим телом → body_mismatch',
      run: (api, expect) => {
        const s = store(api);
        s.reserve(req);
        expect(s.reserve({ ...req, requestHash: 'h2' }).state).toBe('body_mismatch');
      },
    },
    {
      name: 'тот же ключ на другом endpoint → endpoint_mismatch',
      run: (api, expect) => {
        const s = store(api);
        s.reserve(req);
        expect(s.reserve({ ...req, endpoint: '/api/other' }).state).toBe('endpoint_mismatch');
      },
    },
    {
      name: 'ключи разных пользователей независимы',
      run: (api, expect) => {
        const s = store(api);
        s.reserve(req);
        expect(s.reserve({ ...req, userId: 'u2' }).state).toBe('reserved');
      },
    },
  ],
};

export const withTimeout: Exercise = {
  id: 'with-timeout',
  title: 'withTimeout и isRetriableOnTimeout',
  task: `Правило §14: любой сетевой вызов должен падать быстро, а не висеть.

1) withTimeout(promise, ms, label) — вернуть промис, который:
   • разрешается значением promise, если тот успел за ms;
   • иначе отклоняется ошибкой TimeoutError (класс уже объявлен ниже) с сообщением «<label> timeout after <ms>ms».
   Подсказка: Promise.race.

2) isRetriableOnTimeout({ method, headers }) — можно ли автоматически повторить запрос после таймаута:
   • GET и HEAD (без побочных эффектов) — да; method по умолчанию GET;
   • любой другой метод — только если в headers есть 'Idempotency-Key' (без учёта регистра);
   • headers — обычный объект или отсутствует.`,
  exports: ['TimeoutError', 'withTimeout', 'isRetriableOnTimeout'],
  starter: `class TimeoutError extends Error {
  constructor(label, ms) {
    super(label + ' timeout after ' + ms + 'ms')
    this.name = 'TimeoutError'
  }
}

function withTimeout(promise, ms, label) {
  return promise
}

function isRetriableOnTimeout({ method = 'GET', headers } = {}) {
  return true
}
`,
  solution: `class TimeoutError extends Error {
  constructor(label, ms) {
    super(label + ' timeout after ' + ms + 'ms')
    this.name = 'TimeoutError'
  }
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function isRetriableOnTimeout({ method = 'GET', headers } = {}) {
  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD') return true
  return Object.keys(headers ?? {}).some((k) => k.toLowerCase() === 'idempotency-key')
}
`,
  hints: [
    'Promise.race([promise, new Promise((_, reject) => setTimeout(...))]).',
    'Хорошая практика — clearTimeout в finally, чтобы таймер не жил после ответа (в проекте это не делается — подумайте, чем это грозит).',
  ],
  tests: [
    {
      name: 'быстрый промис проходит',
      run: async (api, expect) => {
        expect(await (call(api, 'withTimeout', Promise.resolve(7), 100, 'fast') as Promise<number>)).toBe(7);
      },
    },
    {
      name: 'медленный промис → TimeoutError',
      run: async (api, expect) => {
        const slow = new Promise((r) => setTimeout(() => r('late'), 300));
        await expect(call(api, 'withTimeout', slow, 20, 'auth.getClaims')).rejects.toThrow('auth.getClaims timeout after 20ms');
      },
    },
    {
      name: 'ошибка исходного промиса не подменяется',
      run: async (api, expect) => {
        await expect(call(api, 'withTimeout', Promise.reject(new Error('boom')), 100, 'x')).rejects.toThrow('boom');
      },
    },
    {
      name: 'ошибка таймаута — экземпляр TimeoutError',
      run: async (api, expect) => {
        try {
          await (call(api, 'withTimeout', new Promise(() => {}), 10, 'x') as Promise<unknown>);
        } catch (e) {
          expect(e).toBeInstanceOf(get<new () => Error>(api, 'TimeoutError'));
          return;
        }
        expect('промис не отклонился').toBe('TimeoutError');
      },
    },
    { name: 'GET можно повторить', run: (api, expect) => expect(call(api, 'isRetriableOnTimeout', {})).toBe(true) },
    { name: 'PATCH без ключа — нельзя (ложный 409)', run: (api, expect) => expect(call(api, 'isRetriableOnTimeout', { method: 'patch' })).toBe(false) },
    {
      name: 'POST с ключом — можно',
      run: (api, expect) => expect(call(api, 'isRetriableOnTimeout', { method: 'POST', headers: { 'idempotency-key': 'abc' } })).toBe(true),
    },
  ],
};
