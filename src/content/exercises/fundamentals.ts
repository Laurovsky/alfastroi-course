import type { Exercise } from '@/entities/exercise/model/types';

import { call, get } from './helpers';

export const formatDisplayName: Exercise = {
  id: 'format-display-name',
  title: 'formatDisplayName: «Иванов И. П.»',
  task: `Напишите чистую функцию formatDisplayName(lastName, firstName, middleName), которая превращает ФИО в краткую форму для таблиц: «Иванов И. П.».

Правила (из packages/types/src/formatDisplayName.ts):
• нет ни фамилии, ни имени → «—» (длинное тире);
• инициалы — первые буквы имени и отчества в верхнем регистре с точкой, через пробел;
• отчества может не быть (null/undefined/пустая строка);
• если инициалов нет — только фамилия.`,
  exports: ['formatDisplayName'],
  starter: `function formatDisplayName(lastName, firstName, middleName) {
  // ваш код
}
`,
  solution: `function formatDisplayName(lastName, firstName, middleName) {
  if (!lastName && !firstName) return '—'
  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((n) => n[0].toUpperCase() + '.')
    .join(' ')
  return initials ? lastName + ' ' + initials : lastName
}
`,
  hints: [
    'Начните с крайнего случая: пустые фамилия и имя → «—».',
    'Соберите массив [firstName, middleName], отфильтруйте пустые через .filter(Boolean).',
    'n[0].toUpperCase() + "." даёт инициал; .join(" ") склеивает их.',
  ],
  tests: [
    { name: 'полное ФИО', run: (api, expect) => expect(call(api, 'formatDisplayName', 'Иванов', 'Иван', 'Петрович')).toBe('Иванов И. П.') },
    { name: 'без отчества', run: (api, expect) => expect(call(api, 'formatDisplayName', 'Петрова', 'анна', null)).toBe('Петрова А.') },
    { name: 'пустые фамилия и имя → тире', run: (api, expect) => expect(call(api, 'formatDisplayName', '', '')).toBe('—') },
    { name: 'только фамилия', run: (api, expect) => expect(call(api, 'formatDisplayName', 'Сидоров', '', '')).toBe('Сидоров') },
  ],
};

export const compareCodes: Exercise = {
  id: 'compare-codes',
  title: 'compareCodes: почему «6.10» больше «6.2»',
  task: `Строковое сравнение ставит '6.10' раньше '6.2' — потому что символ '1' меньше '2'. Для кодов работ это неверно.

Напишите компаратор compareCodes(a, b) для Array.prototype.sort: коды сравниваются по сегментам через точку, числовые сегменты — как числа, нечисловые — как строки. Более короткий код, являющийся префиксом, идёт раньше ('6.2' < '6.2.1').

Результат: отрицательное число, если a < b; положительное, если a > b; 0 — если равны.`,
  exports: ['compareCodes'],
  starter: `function compareCodes(a, b) {
  return a < b ? -1 : a > b ? 1 : 0 // строковое сравнение — тесты покажут, где оно ломается
}
`,
  solution: `function compareCodes(a, b) {
  const as = a.split('.')
  const bs = b.split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const sa = as[i] ?? ''
    const sb = bs[i] ?? ''
    if (sa === sb) continue
    const na = Number(sa)
    const nb = Number(sb)
    if (sa !== '' && sb !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return sa < sb ? -1 : 1
  }
  return 0
}
`,
  hints: [
    'a.split(".") превращает «6.10» в ["6", "10"].',
    'Идите по индексу до максимальной длины; отсутствующий сегмент считайте пустой строкой — она меньше любой.',
    'Number("10") - Number("2") > 0 — это и есть правильный порядок.',
  ],
  tests: [
    { name: "'6.2' < '6.10'", run: (api, expect) => expect(call(api, 'compareCodes', '6.2', '6.10')).toBeLessThan(0) },
    { name: 'равные коды → 0', run: (api, expect) => expect(call(api, 'compareCodes', '6.2.1', '6.2.1')).toBe(0) },
    { name: 'префикс идёт раньше', run: (api, expect) => expect(call(api, 'compareCodes', '6.2', '6.2.1')).toBeLessThan(0) },
    {
      name: 'сортировка списка',
      run: (api, expect) => {
        const codes = ['6.10', '6.2.3', '6.1', '6.2', '10.1', '6.9']
        expect([...codes].sort(get<(a: string, b: string) => number>(api, 'compareCodes'))).toEqual(['6.1', '6.2', '6.2.3', '6.9', '6.10', '10.1'])
      },
    },
  ],
};

export const buildTree: Exercise = {
  id: 'build-tree',
  title: 'buildTree: дерево из плоского списка',
  task: `Сервер отдаёт каталог работ плоским списком: { id, parent_id, sort_order, name }. Корни — с parent_id === null.

Напишите buildTree(items), которая возвращает массив корней, где у каждого узла есть children (тоже отсортированные по sort_order).

Важно (правило §13 проекта): обход графа — всегда с visited Set. Если из-за ошибки данных в parent_id появился цикл, функция не должна уйти в бесконечную рекурсию: узел, который уже встречался, второй раз не добавляется.`,
  exports: ['buildTree'],
  starter: `function buildTree(items) {
  const childrenMap = new Map()
  // 1. разложите items по parent_id
  // 2. отсортируйте каждую группу по sort_order
  // 3. рекурсивно соберите узлы, начиная с parent_id === null
  return []
}
`,
  solution: `function buildTree(items) {
  const childrenMap = new Map()
  for (const item of items) {
    const bucket = childrenMap.get(item.parent_id)
    if (bucket) bucket.push(item)
    else childrenMap.set(item.parent_id, [item])
  }
  for (const bucket of childrenMap.values()) bucket.sort((a, b) => a.sort_order - b.sort_order)

  const visited = new Set()
  function toNodes(parentId) {
    const children = childrenMap.get(parentId) ?? []
    const nodes = []
    for (const item of children) {
      if (visited.has(item.id)) continue
      visited.add(item.id)
      nodes.push({ ...item, children: toNodes(item.id) })
    }
    return nodes
  }
  return toNodes(null)
}
`,
  hints: [
    'Map<parent_id, item[]> строится одним проходом.',
    'toNodes(parentId) возвращает отсортированных детей, у каждого children = toNodes(item.id).',
    'Перед рекурсией проверьте visited.has(item.id) и добавьте id в visited.',
  ],
  tests: [
    {
      name: 'корни и дети',
      run: (api, expect) => {
        const tree = call(api, 'buildTree', [
          { id: 'a', parent_id: null, sort_order: 10, name: 'Вентиляция' },
          { id: 'b', parent_id: 'a', sort_order: 10, name: 'Монтаж' },
        ]) as Array<{ id: string; children: Array<{ id: string }> }>
        expect(tree.map((n) => n.id)).toEqual(['a'])
        expect(tree[0].children.map((n) => n.id)).toEqual(['b'])
      },
    },
    {
      name: 'дети отсортированы по sort_order, а не по name или code',
      run: (api, expect) => {
        const tree = call(api, 'buildTree', [
          { id: 'r', parent_id: null, sort_order: 10, name: 'root' },
          { id: 'x', parent_id: 'r', sort_order: 30, name: 'А' },
          { id: 'y', parent_id: 'r', sort_order: 10, name: 'Я' },
          { id: 'z', parent_id: 'r', sort_order: 20, name: 'М' },
        ]) as Array<{ children: Array<{ id: string }> }>
        expect(tree[0].children.map((n) => n.id)).toEqual(['y', 'z', 'x'])
      },
    },
    {
      name: 'пустой список → пустой массив',
      run: (api, expect) => expect(call(api, 'buildTree', [])).toEqual([]),
    },
    {
      name: 'цикл в parent_id не вешает функцию',
      run: (api, expect) => {
        // r → a → b → a (цикл). Дерево должно построиться без зависания.
        const tree = call(api, 'buildTree', [
          { id: 'r', parent_id: null, sort_order: 10 },
          { id: 'a', parent_id: 'r', sort_order: 10 },
          { id: 'b', parent_id: 'a', sort_order: 10 },
          { id: 'a', parent_id: 'b', sort_order: 10 },
        ]) as Array<{ children: Array<{ children: Array<{ children: unknown[] }> }> }>
        expect(tree).toHaveLength(1)
        expect(tree[0].children[0].children[0].children).toEqual([])
      },
    },
  ],
};

export const deriveRowType: Exercise = {
  id: 'derive-row-type',
  title: 'deriveRowType: section | work | material',
  task: `Строка ТКП (сметы из Excel) бывает трёх типов: 'section' (заголовок раздела), 'work' (работа), 'material' (материал).

Реализуйте deriveRowType(row), где row = { row_type?, unit, code }:
• если row_type уже задан (парсер Sminex знает тип точно) — вернуть его;
• unit пустой, null или из пробелов → 'section';
• code непустой (после trim) и unit задан → 'work';
• иначе → 'material'.

Обратите внимание на trim: именно отсутствие trim в одной из шести копий этой эвристики было реальным багом проекта.`,
  exports: ['deriveRowType'],
  starter: `function deriveRowType(row) {
  if (row.unit === null) return 'section'
  if (row.code) return 'work'
  return 'material'
}
`,
  solution: `function deriveRowType(row) {
  if (row.row_type) return row.row_type
  if (row.unit === null || row.unit.trim() === '') return 'section'
  if (row.code !== null && row.code.trim() !== '') return 'work'
  return 'material'
}
`,
  hints: ['Первой строкой уважайте уже проставленный row_type.', 'Сравнивайте row.unit.trim() === "" и row.code.trim() !== "".'],
  tests: [
    { name: 'уважает проставленный row_type', run: (api, expect) => expect(call(api, 'deriveRowType', { row_type: 'material', unit: null, code: '6.1' })).toBe('material') },
    { name: 'unit null → section', run: (api, expect) => expect(call(api, 'deriveRowType', { unit: null, code: '6.1' })).toBe('section') },
    { name: 'unit из пробелов → section', run: (api, expect) => expect(call(api, 'deriveRowType', { unit: '   ', code: '6.1' })).toBe('section') },
    { name: 'code + unit → work', run: (api, expect) => expect(call(api, 'deriveRowType', { unit: 'шт', code: '6.1' })).toBe('work') },
    { name: 'пробельный code → material (регрессия)', run: (api, expect) => expect(call(api, 'deriveRowType', { unit: 'м', code: '  ' })).toBe('material') },
  ],
};

export const isValidPeriod: Exercise = {
  id: 'is-valid-period',
  title: 'TDD: isValidPeriod("2026-07")',
  task: `Пакет выполнения (completion_batches) хранит период в формате YYYY-MM. Напишите isValidPeriod(text) по циклу TDD.

Проделайте это честно: нажимайте «Запустить тесты» после каждого маленького шага. Сначала все тесты красные (Red). Сделайте зелёным первый — самым простым способом (Green). Затем следующий. Когда всё зелёное — приведите код в порядок (Refactor) и убедитесь, что тесты всё ещё зелёные.

Правила: ровно 4 цифры года, дефис, 2 цифры месяца; месяц 01–12; год от 2000 до 2100.`,
  exports: ['isValidPeriod'],
  starter: `function isValidPeriod(text) {
  return false
}
`,
  solution: `function isValidPeriod(text) {
  const m = /^(\\d{4})-(\\d{2})$/.exec(text)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12
}
`,
  hints: ['Регулярное выражение /^(\\d{4})-(\\d{2})$/ проверяет формат и выделяет группы.', 'Number(m[2]) превращает "07" в 7.'],
  tests: [
    { name: '1. обычный период валиден', run: (api, expect) => expect(call(api, 'isValidPeriod', '2026-07')).toBe(true) },
    { name: '2. месяц без ведущего нуля — невалиден', run: (api, expect) => expect(call(api, 'isValidPeriod', '2026-7')).toBe(false) },
    { name: '3. месяц 13 — невалиден', run: (api, expect) => expect(call(api, 'isValidPeriod', '2026-13')).toBe(false) },
    { name: '4. месяц 00 — невалиден', run: (api, expect) => expect(call(api, 'isValidPeriod', '2026-00')).toBe(false) },
    { name: '5. лишние символы — невалиден', run: (api, expect) => expect(call(api, 'isValidPeriod', ' 2026-07')).toBe(false) },
    { name: '6. год вне диапазона — невалиден', run: (api, expect) => expect(call(api, 'isValidPeriod', '1999-12')).toBe(false) },
  ],
};
