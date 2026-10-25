import type { Exercise } from '@/entities/exercise/model/types';
import { call, get } from './helpers';

type Table = {
  insert(row: { id: string; [k: string]: unknown }): unknown;
  get(id: string): { version: number; [k: string]: unknown } | undefined;
};

export const conditionalUpdate: Exercise = {
  id: 'conditional-update',
  title: 'conditionalUpdate: UPDATE … WHERE version = ?',
  task: `Два инженера открыли одну расценку. Первый сохранил 1500 ₽, второй — 1800 ₽, не видя чужой правки. Без защиты второй молча перезапишет первого.

Реализуйте оптимистичную блокировку (§2):
• createTable() → { insert(row), get(id) } — хранилище строк в памяти; insert ставит version = 1;
• conditionalUpdate(table, { id, prevVersion, patch }) — если текущая version строки равна prevVersion, применить patch, увеличить version на 1 и вернуть новую строку; иначе бросить ConflictError (класс объявлен).

Строки, которые возвращает get/conditionalUpdate, не должны быть той же ссылкой, что внутри хранилища (иначе вызывающий код сможет «изменить базу» мутацией).`,
  exports: ['ConflictError', 'createTable', 'conditionalUpdate'],
  starter: `class ConflictError extends Error {
  constructor(message = 'Запись была изменена другим пользователем') {
    super(message)
    this.name = 'ConflictError'
  }
}

function createTable() {
  const rows = new Map()
  return {
    insert(row) {},
    get(id) {},
    _rows: rows,
  }
}

function conditionalUpdate(table, { id, prevVersion, patch }) {
  // UPDATE table SET ...patch, version = prevVersion + 1 WHERE id = ? AND version = prevVersion
}
`,
  solution: `class ConflictError extends Error {
  constructor(message = 'Запись была изменена другим пользователем') {
    super(message)
    this.name = 'ConflictError'
  }
}

function createTable() {
  const rows = new Map()
  return {
    insert(row) {
      const stored = { ...row, version: 1 }
      rows.set(row.id, stored)
      return { ...stored }
    },
    get(id) {
      const row = rows.get(id)
      return row ? { ...row } : undefined
    },
    _rows: rows,
  }
}

function conditionalUpdate(table, { id, prevVersion, patch }) {
  const current = table._rows.get(id)
  if (!current || current.version !== prevVersion) throw new ConflictError()
  const next = { ...current, ...patch, version: prevVersion + 1 }
  table._rows.set(id, next)
  return { ...next }
}
`,
  hints: [
    'Это атомарная операция «сравни и запиши» (compare-and-swap). В Postgres атомарность даёт сам UPDATE … WHERE.',
    'Возвращайте копию: { ...row }.',
  ],
  tests: [
    {
      name: 'insert ставит version = 1',
      run: (api, expect) => {
        const t = call(api, 'createTable') as Table;
        t.insert({ id: 'r1', unit_rate: 1000 });
        expect(t.get('r1')?.version).toBe(1);
      },
    },
    {
      name: 'обновление с актуальной версией',
      run: (api, expect) => {
        const t = call(api, 'createTable') as Table;
        t.insert({ id: 'r1', unit_rate: 1000 });
        const row = call(api, 'conditionalUpdate', t, { id: 'r1', prevVersion: 1, patch: { unit_rate: 1500 } }) as { version: number; unit_rate: number };
        expect(row.version).toBe(2);
        expect(t.get('r1')?.unit_rate).toBe(1500);
      },
    },
    {
      name: 'гонка двух пользователей → ConflictError второму',
      run: (api, expect) => {
        const t = call(api, 'createTable') as Table;
        t.insert({ id: 'r1', unit_rate: 1000 });
        call(api, 'conditionalUpdate', t, { id: 'r1', prevVersion: 1, patch: { unit_rate: 1500 } });
        expect(() => call(api, 'conditionalUpdate', t, { id: 'r1', prevVersion: 1, patch: { unit_rate: 1800 } })).toThrow(
          get<new () => Error>(api, 'ConflictError'),
        );
        expect(t.get('r1')?.unit_rate).toBe(1500);
      },
    },
    {
      name: 'нет строки → ConflictError',
      run: (api, expect) => {
        const t = call(api, 'createTable') as Table;
        expect(() => call(api, 'conditionalUpdate', t, { id: 'nope', prevVersion: 1, patch: {} })).toThrow('изменена');
      },
    },
    {
      name: 'мутация результата не меняет хранилище',
      run: (api, expect) => {
        const t = call(api, 'createTable') as Table;
        t.insert({ id: 'r1', unit_rate: 1000 });
        const row = t.get('r1')!;
        row.unit_rate = 0;
        expect(t.get('r1')?.unit_rate).toBe(1000);
      },
    },
  ],
};

export const rpcErrorMapping: Exercise = {
  id: 'rpc-error-mapping',
  title: 'От RAISE EXCEPTION к HTTP-статусу',
  task: `RPC-функции в Postgres сообщают об ошибках префиксом в тексте: RAISE EXCEPTION 'CONFLICT: …' или 'FORBIDDEN: …'. На сервере rpcRunner превращает их в классы ошибок, а errorHandler — в HTTP-ответ.

Напишите toHttpError(message): { status, code, error }:
• 'CONFLICT: текст' → { status: 409, code: 'CONFLICT', error: 'текст' } (префикс и пробелы убраны);
• 'FORBIDDEN: текст' → { status: 403, code: 'FORBIDDEN', error: 'текст' };
• всё остальное → { status: 500, code: 'INTERNAL_ERROR', error: 'Внутренняя ошибка сервера' }.
Детали внутренних ошибок НЕ отдаются клиенту: они пишутся в лог и Sentry.`,
  exports: ['toHttpError'],
  starter: `function toHttpError(message) {
  return { status: 500, code: 'INTERNAL_ERROR', error: message }
}
`,
  solution: `function toHttpError(message) {
  if (message.startsWith('CONFLICT:')) return { status: 409, code: 'CONFLICT', error: message.slice('CONFLICT:'.length).trim() }
  if (message.startsWith('FORBIDDEN:')) return { status: 403, code: 'FORBIDDEN', error: message.slice('FORBIDDEN:'.length).trim() }
  return { status: 500, code: 'INTERNAL_ERROR', error: 'Внутренняя ошибка сервера' }
}
`,
  hints: ['message.startsWith("CONFLICT:") и message.slice(9).trim().'],
  tests: [
    {
      name: 'CONFLICT → 409',
      run: (api, expect) =>
        expect(call(api, 'toHttpError', 'CONFLICT: Анализ был изменён другим пользователем')).toEqual({ status: 409, code: 'CONFLICT', error: 'Анализ был изменён другим пользователем' }),
    },
    {
      name: 'FORBIDDEN → 403',
      run: (api, expect) =>
        expect(call(api, 'toHttpError', 'FORBIDDEN: Переименовывать анализ может только инженер')).toEqual({ status: 403, code: 'FORBIDDEN', error: 'Переименовывать анализ может только инженер' }),
    },
    {
      name: 'прочее → 500 без утечки деталей',
      run: (api, expect) =>
        expect(call(api, 'toHttpError', 'relation "secret_table" does not exist')).toEqual({ status: 500, code: 'INTERNAL_ERROR', error: 'Внутренняя ошибка сервера' }),
    },
  ],
};

export const findCommonPrefix: Exercise = {
  id: 'find-common-prefix',
  title: 'findCommonPrefix: корень системы в ТКП',
  task: `TKPParser.detectSystems определяет корень системы как общий префикс кодов всех её работ — по сегментам через точку.

findCommonPrefix(['6.2.2.2.3.5', '6.2.2.2.4.1']) → '6.2.2.2'.

Правила: пустой массив → ''; один код → сам код; сравнение по целым сегментам ('6.21' и '6.2' имеют общий префикс '6', а не '6.2').`,
  exports: ['findCommonPrefix'],
  starter: `function findCommonPrefix(codes) {
  return ''
}
`,
  solution: `function findCommonPrefix(codes) {
  if (codes.length === 0) return ''
  const segments = codes[0].split('.')
  let depth = segments.length
  for (const code of codes.slice(1)) {
    const parts = code.split('.')
    let match = 0
    while (match < Math.min(depth, parts.length) && parts[match] === segments[match]) match++
    depth = match
    if (depth === 0) return ''
  }
  return segments.slice(0, depth).join('.')
}
`,
  hints: ['Возьмите сегменты первого кода и уменьшайте глубину совпадения с каждым следующим.'],
  tests: [
    { name: 'пример из JSDoc', run: (api, expect) => expect(call(api, 'findCommonPrefix', ['6.2.2.2.3.5', '6.2.2.2.4.1'])).toBe('6.2.2.2') },
    { name: 'пустой список', run: (api, expect) => expect(call(api, 'findCommonPrefix', [])).toBe('') },
    { name: 'один код', run: (api, expect) => expect(call(api, 'findCommonPrefix', ['6.1.3'])).toBe('6.1.3') },
    { name: 'по сегментам, а не по символам', run: (api, expect) => expect(call(api, 'findCommonPrefix', ['6.21.1', '6.2.1'])).toBe('6') },
    { name: 'нет общего префикса', run: (api, expect) => expect(call(api, 'findCommonPrefix', ['6.1', '7.1'])).toBe('') },
  ],
};

type Action = { action: string; requiredVersion: number; disabledReason: string | null };
const actions = (api: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (call(api, 'analysisActions', { version: 3, hasContent: true, ...ctx }) as Action[]).map((a) => (a.disabledReason ? `${a.action}!` : a.action));

export const analysisActions: Exercise = {
  id: 'analysis-actions',
  title: 'analysisActions: какие кнопки показать',
  task: `ApprovalWorkflow решает, какие действия доступны пользователю над анализом. Реализуйте analysisActions(ctx), где ctx = { status, userRole, version, hasContent, canEdit, isAssignedCurrentStep }.

Верните массив { action, requiredVersion, disabledReason }:
• status 'draft' и роль engineer (или supervisor с canEdit === true) → [submit]; если hasContent === false — disabledReason 'Добавьте хотя бы одну позицию', иначе null;
• status 'pending_approval' и роль supervisor или admin → [approve, reject], но supervisor — только если isAssignedCurrentStep === true; admin — всегда (super-access);
• в остальных случаях → [].
requiredVersion = ctx.version (клиент пришлёт её обратно — так действие защищено от гонки).`,
  exports: ['analysisActions'],
  starter: `function analysisActions(ctx) {
  const { status, userRole, version, hasContent } = ctx
  return []
}
`,
  solution: `function analysisActions(ctx) {
  const { status, userRole, version, hasContent } = ctx
  const canApprove = userRole === 'supervisor' || userRole === 'admin'
  if (status === 'draft' && (userRole === 'engineer' || (userRole === 'supervisor' && ctx.canEdit === true))) {
    return [{ action: 'submit', requiredVersion: version, disabledReason: hasContent ? null : 'Добавьте хотя бы одну позицию' }]
  }
  if (status === 'pending_approval' && canApprove) {
    if (userRole !== 'admin' && ctx.isAssignedCurrentStep !== true) return []
    return [
      { action: 'approve', requiredVersion: version, disabledReason: null },
      { action: 'reject', requiredVersion: version, disabledReason: null },
    ]
  }
  return []
}
`,
  hints: ['Сначала ветка draft, затем pending_approval, по умолчанию — пустой массив.', 'Проверка назначения: userRole !== "admin" && ctx.isAssignedCurrentStep !== true → [].'],
  tests: [
    { name: 'инженер отправляет черновик', run: (api, expect) => expect(actions(api, { status: 'draft', userRole: 'engineer' })).toEqual(['submit']) },
    { name: 'пустой черновик — кнопка неактивна', run: (api, expect) => expect(actions(api, { status: 'draft', userRole: 'engineer', hasContent: false })).toEqual(['submit!']) },
    { name: 'прораб черновик не отправляет', run: (api, expect) => expect(actions(api, { status: 'draft', userRole: 'foreman' })).toEqual([]) },
    { name: 'supervisor с canEdit — может', run: (api, expect) => expect(actions(api, { status: 'draft', userRole: 'supervisor', canEdit: true })).toEqual(['submit']) },
    {
      name: 'назначенный supervisor согласует',
      run: (api, expect) => expect(actions(api, { status: 'pending_approval', userRole: 'supervisor', isAssignedCurrentStep: true })).toEqual(['approve', 'reject']),
    },
    { name: 'не назначенный supervisor — ничего', run: (api, expect) => expect(actions(api, { status: 'pending_approval', userRole: 'supervisor' })).toEqual([]) },
    { name: 'admin — super-access', run: (api, expect) => expect(actions(api, { status: 'pending_approval', userRole: 'admin' })).toEqual(['approve', 'reject']) },
    { name: 'согласованный анализ — без действий', run: (api, expect) => expect(actions(api, { status: 'approved', userRole: 'admin' })).toEqual([]) },
    {
      name: 'requiredVersion = текущая версия',
      run: (api, expect) => expect((call(api, 'analysisActions', { status: 'draft', userRole: 'engineer', version: 7, hasContent: true }) as Action[])[0].requiredVersion).toBe(7),
    },
  ],
};

export const stableSelector: Exercise = {
  id: 'stable-selector',
  title: 'Стабильный селектор Zustand',
  task: `Zustand перерисовывает компонент, когда селектор вернул НОВУЮ ссылку (сравнение через Object.is). Селектор s => s.byAnalysis[id] ?? [] создаёт новый пустой массив при каждом вызове → бесконечный ре-рендер (грабли из §10).

Напишите selectRates(state, analysisId): массив state.ratesByAnalysis[analysisId], а если его нет — ОДИН И ТОТ ЖЕ пустой массив при каждом вызове (модульная константа EMPTY_RATES, объявите её сами).`,
  exports: ['selectRates', 'EMPTY_RATES'],
  starter: `function selectRates(state, analysisId) {
  return state.ratesByAnalysis[analysisId] ?? []
}
`,
  solution: `const EMPTY_RATES = Object.freeze([])

function selectRates(state, analysisId) {
  return state.ratesByAnalysis[analysisId] ?? EMPTY_RATES
}
`,
  hints: ['Вынесите [] в const снаружи функции. Object.freeze защитит константу от случайного push.'],
  tests: [
    {
      name: 'возвращает данные анализа',
      run: (api, expect) => {
        const rates = [{ id: 'r1' }];
        expect(call(api, 'selectRates', { ratesByAnalysis: { a1: rates } }, 'a1')).toBe(rates);
      },
    },
    {
      name: 'пустой результат — одна и та же ссылка',
      run: (api, expect) => {
        const state = { ratesByAnalysis: {} };
        expect(call(api, 'selectRates', state, 'x')).toBe(call(api, 'selectRates', state, 'y'));
      },
    },
    {
      name: 'это экспортированная константа EMPTY_RATES',
      run: (api, expect) => {
        expect(call(api, 'selectRates', { ratesByAnalysis: {} }, 'x')).toBe(get(api, 'EMPTY_RATES'));
        expect(get<unknown[]>(api, 'EMPTY_RATES')).toHaveLength(0);
      },
    },
  ],
};

type Violation = { rule: string };
const check = (api: Record<string, unknown>, from: string, to: string, typeOnly = false) =>
  (call(api, 'checkImport', from, to, typeOnly) as Violation[]).map((v) => v.rule);

export const checkImport: Exercise = {
  id: 'check-import',
  title: 'Линтер границ FSD',
  task: `Напишите упрощённую версию проверки из client/scripts/frontend-boundaries.mjs.

checkImport(fromFile, targetFile, typeOnly) → массив нарушений { rule }. Пути вида 'src/<layer>/<slice>/…'.
Слои по порядку: app, pages, widgets, features, entities, shared. Слайсы есть у widgets, features, entities.

Правила:
1. 'fsd-layer' — импорт ВВЕРХ (в слой левее по списку) запрещён.
2. 'fsd-slice' — в слоях со слайсами нельзя импортировать соседний слайс того же слоя. Исключение: entities → entities, если импорт type-only и цель — файл 'src/entities/<цель>/@x/<свой-слайс>.ts'.
3. 'fsd-public-api' — импорт в чужой слайс допустим только через его 'src/<layer>/<slice>/index.ts' (кроме исключения @x).
Файлы вне шести слоёв (например, src/lib) не проверяются как источник; цель вне слоёв — не проверяется вовсе. Внутри своего слайса можно всё.`,
  exports: ['checkImport'],
  starter: `const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']
const sliceLayers = new Set(['widgets', 'features', 'entities'])

function meta(file) {
  const parts = file.split('/')
  const layer = parts[1]
  if (!layers.includes(layer)) return null
  return { layer, slice: sliceLayers.has(layer) ? parts[2] : null }
}

function checkImport(fromFile, targetFile, typeOnly = false) {
  const violations = []
  // ваш код
  return violations
}
`,
  solution: `const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']
const sliceLayers = new Set(['widgets', 'features', 'entities'])

function meta(file) {
  const parts = file.split('/')
  const layer = parts[1]
  if (!layers.includes(layer)) return null
  return { layer, slice: sliceLayers.has(layer) ? parts[2] : null }
}

function checkImport(fromFile, targetFile, typeOnly = false) {
  const violations = []
  const from = meta(fromFile)
  const to = meta(targetFile)
  if (!to) return violations
  const target = targetFile.replace(/\\.[jt]sx?$/, '')
  if (from && layers.indexOf(to.layer) < layers.indexOf(from.layer)) violations.push({ rule: 'fsd-layer' })
  const sameSlice = from && from.layer === to.layer && from.slice === to.slice
  const crossEntity = from && from.layer === 'entities' && to.layer === 'entities' && typeOnly &&
    target === 'src/entities/' + to.slice + '/@x/' + from.slice
  if (from && from.layer === to.layer && sliceLayers.has(from.layer) && !sameSlice && !crossEntity)
    violations.push({ rule: 'fsd-slice' })
  if (sliceLayers.has(to.layer) && !sameSlice && !crossEntity && target !== 'src/' + to.layer + '/' + to.slice + '/index')
    violations.push({ rule: 'fsd-public-api' })
  return violations
}
`,
  hints: [
    'layers.indexOf(to.layer) < layers.indexOf(from.layer) — импорт вверх.',
    'Сравнивайте путь без расширения: target.replace(/\\.[jt]sx?$/, "").',
    'Одно нарушение не отменяет другое: импорт может нарушать сразу два правила.',
  ],
  tests: [
    { name: 'widget → entity через index — ок', run: (api, expect) => expect(check(api, 'src/widgets/analysis-editor/ui/X.tsx', 'src/entities/analysis/index.ts')).toEqual([]) },
    { name: 'внутри своего слайса — ок', run: (api, expect) => expect(check(api, 'src/features/edit-analysis/model/a.ts', 'src/features/edit-analysis/lib/b.ts')).toEqual([]) },
    { name: 'shared → entities — импорт вверх', run: (api, expect) => expect(check(api, 'src/shared/api/api.ts', 'src/entities/catalog/index.ts')).toEqual(['fsd-layer']) },
    {
      name: 'feature → feature — соседний слайс',
      run: (api, expect) => expect(check(api, 'src/features/edit-allocations/model/a.ts', 'src/features/manage-additional-acts/index.ts')).toEqual(['fsd-slice']),
    },
    {
      name: 'обход public API',
      run: (api, expect) => expect(check(api, 'src/pages/analysis/Page.tsx', 'src/widgets/analysis-editor/model/store.ts')).toEqual(['fsd-public-api']),
    },
    {
      name: 'entities → entities через @x, type-only — ок',
      run: (api, expect) => expect(check(api, 'src/entities/execution/model/t.ts', 'src/entities/catalog/@x/execution.ts', true)).toEqual([]),
    },
    {
      name: 'тот же @x, но runtime-импорт — нарушение',
      run: (api, expect) => expect(check(api, 'src/entities/execution/model/t.ts', 'src/entities/catalog/@x/execution.ts', false)).toEqual(['fsd-slice', 'fsd-public-api']),
    },
    { name: 'shared → shared — ок (нет слайсов)', run: (api, expect) => expect(check(api, 'src/shared/api/api.ts', 'src/shared/lib/sentry/index.ts')).toEqual([]) },
  ],
};
