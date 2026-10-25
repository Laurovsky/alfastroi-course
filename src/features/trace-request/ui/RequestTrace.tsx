import { useState } from 'react';
import { Source, type SourceProps } from '@/shared/ui/code';

interface Step {
  id: string;
  layer: string;
  title: string;
  explain: string;
  source: SourceProps;
}

const steps: Step[] = [
  {
    id: 'client',
    layer: 'Клиент',
    title: 'apiFetch отправляет PATCH',
    explain:
      'Компонент вызывает apiFetch("/api/analyses/:id/name", { method: "PATCH", body: { name, prev_version } }). apiFetch добавляет JWT, ставит таймаут и решает, можно ли повторить запрос при таймауте.',
    source: { path: 'client/src/shared/api/api.ts', from: 'async function rawApiFetch' },
  },
  {
    id: 'router',
    layer: 'Routes',
    title: 'Express находит маршрут и цепочку middleware',
    explain: 'Маршрут — это цепочка функций: authMiddleware → requireRole → обработчик. Каждая может ответить сама и не передать управление дальше.',
    source: { path: 'server/src/modules/analyses/routes.ts', from: 'PATCH /api/analyses/:id/name', withDoc: false },
  },
  {
    id: 'auth',
    layer: 'Middleware',
    title: 'authMiddleware: кто вы?',
    explain: 'Проверяет Bearer-токен (подпись JWT через getClaims), достаёт роль из profiles и кладёт { id, role } в req.user. Все сетевые вызовы — с таймаутом 3 с.',
    source: { path: 'server/src/middleware/auth.ts', from: 'export async function authMiddleware' },
  },
  {
    id: 'role',
    layer: 'Middleware',
    title: 'requireRole: можно ли вам?',
    explain: 'Первый рубеж прав. Не единственный: та же проверка повторится внутри SQL-функции (defense in depth).',
    source: { path: 'server/src/middleware/auth.ts', from: 'export function requireRole' },
  },
  {
    id: 'zod',
    layer: 'Validators',
    title: 'Zod проверяет тело запроса',
    explain: 'Схема описывает форму данных; parseOr400 отвечает 400 с деталями по полям. Дальше по коду body уже типизирован.',
    source: { path: 'server/src/modules/analyses/validators.ts', from: 'export const updateAnalysisNameBodySchema' },
  },
  {
    id: 'service',
    layer: 'Service',
    title: 'Сервис формулирует действие',
    explain: 'Application layer: переводит HTTP-вход в вызов бизнес-операции. Здесь нет req/res — сервис можно тестировать без Express.',
    source: { path: 'server/src/modules/analyses/service.ts', from: 'export async function renameAnalysis' },
  },
  {
    id: 'rpc',
    layer: 'lib/rpcRunner',
    title: 'runRpc вызывает функцию Postgres',
    explain: 'Одна RPC = одна транзакция. Префиксы CONFLICT:/FORBIDDEN: в тексте ошибки превращаются в классы ConflictError/ForbiddenError.',
    source: { path: 'server/src/lib/rpcRunner.ts', from: 'export async function runRawRpc' },
  },
  {
    id: 'sql',
    layer: 'PostgreSQL',
    title: 'rename_analysis: права, версия, UPDATE, audit',
    explain: 'Внутри транзакции: проверка роли, блокировка строки FOR UPDATE с version-check, UPDATE с version+1 и запись в audit_log. Любая ошибка — откат всего.',
    source: { path: 'sql/101_rename_analysis.sql' },
  },
  {
    id: 'errors',
    layer: 'errorHandler',
    title: 'Ошибка превращается в HTTP-ответ',
    explain: 'Последний middleware Express. Известные классы ошибок → 400/403/404/409; всё прочее → 500 без деталей наружу, детали — в лог и Sentry.',
    source: { path: 'server/src/middleware/errorHandler.ts', from: 'export const errorHandler' },
  },
];

interface Scenario {
  label: string;
  /** Шаг, на котором запрос завершится ответом. */
  stopAt: string;
  response: string;
  ok: boolean;
}

const scenarios: Scenario[] = [
  { label: 'Всё хорошо', stopAt: 'sql', response: '200 OK — анализ с новым name и version + 1', ok: true },
  { label: 'Нет токена', stopAt: 'auth', response: '401 { error: "Токен не предоставлен" }', ok: false },
  { label: 'Пишет прораб', stopAt: 'role', response: '403 { error: "Недостаточно прав" }', ok: false },
  { label: 'Пустое название', stopAt: 'zod', response: '400 { error: "Невалидные параметры", details: { name: [...] } }', ok: false },
  { label: 'Устаревшая версия', stopAt: 'errors', response: '409 { code: "CONFLICT", error: "Анализ был изменён другим пользователем" }', ok: false },
];

/** Пошаговая трассировка одного запроса через все слои приложения. */
export function RequestTrace() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const scenario = scenarios[scenarioIndex];
  const route = scenario.stopAt === 'errors' ? steps.map((s) => s.id) : steps.slice(0, steps.findIndex((s) => s.id === scenario.stopAt) + 1).map((s) => s.id);
  const visible = steps.filter((s) => route.includes(s.id));
  const current = visible[Math.min(position, visible.length - 1)];
  const finished = position >= visible.length - 1;

  return (
    <section className="widget">
      <header className="widget__head">
        <span className="widget__badge">Интерактив</span> PATCH /api/analyses/:id/name — шаг за шагом
      </header>
      <div className="sim-actors" role="radiogroup" aria-label="Сценарий">
        {scenarios.map((s, i) => (
          <label key={s.label} className={`chip${i === scenarioIndex ? ' chip--on' : ''}`}>
            <input
              type="radio"
              name="trace-scenario"
              checked={i === scenarioIndex}
              onChange={() => {
                setScenarioIndex(i);
                setPosition(0);
              }}
            />
            {s.label}
          </label>
        ))}
      </div>

      <ol className="trace">
        {steps.map((s) => {
          const index = visible.indexOf(s);
          const state = index === -1 ? 'skipped' : index < position ? 'done' : index === position ? 'current' : 'todo';
          return (
            <li key={s.id} className={`trace__step trace__step--${state}`}>
              <button type="button" disabled={index === -1} onClick={() => setPosition(index)}>
                <span className="trace__layer">{s.layer}</span> {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="trace__detail">
        <p>{current.explain}</p>
        <Source {...current.source} />
        {finished && (
          <p className={`verdict verdict--${scenario.ok ? 'ok' : 'fail'}`}>
            Ответ клиенту: <code>{scenario.response}</code>
          </p>
        )}
      </div>

      <div className="sim-buttons">
        <button type="button" className="btn" disabled={position === 0} onClick={() => setPosition((p) => p - 1)}>
          ← Назад
        </button>
        <button type="button" className="btn btn--primary" disabled={finished} onClick={() => setPosition((p) => p + 1)}>
          Следующий шаг →
        </button>
      </div>
    </section>
  );
}
