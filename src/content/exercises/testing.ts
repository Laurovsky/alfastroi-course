import type { Exercise } from '@/entities/exercise/model/types';
import { call } from './helpers';

const parse = (api: Record<string, unknown>, text: string) => call(api, 'parseNumericExpression', text);

export const numericExpression: Exercise = {
  id: 'numeric-expression',
  title: 'Ката: parseNumericExpression',
  task: `Прораб вводит объём прямо в ячейку и хочет писать «12,5*4+3». Нужна функция parseNumericExpression(text): number | null.

Тесты расположены в порядке TDD — от простого к сложному. Не пытайтесь пройти все сразу: делайте зелёным следующий красный тест минимальным изменением.

Требования (как в client/src/shared/lib/numeric-expression):
• числа с точкой или запятой: «12,5» → 12.5;
• операции + − * / с обычным приоритетом (* и / раньше + и −);
• унарный минус у числа: «-3+5» → 2;
• мусор, пустая строка, «2+» или деление на ноль → null;
• НЕЛЬЗЯ использовать eval / new Function — пользовательский ввод не должен исполняться как код.`,
  exports: ['parseNumericExpression'],
  starter: `function parseNumericExpression(text) {
  return null
}
`,
  solution: `function parseNumericExpression(text) {
  const source = text.trim()
  if (!source) return null
  const re = /\\s*(\\d+(?:[.,]\\d*)?|[.,]\\d+|[+*/-])/y
  const tokens = []
  let offset = 0
  while (offset < source.length) {
    re.lastIndex = offset
    const m = re.exec(source)
    if (!m) return null
    tokens.push(m[1])
    offset = re.lastIndex
  }
  let i = 0
  const number = () => {
    let sign = 1
    if (tokens[i] === '-' || tokens[i] === '+') sign = tokens[i++] === '-' ? -1 : 1
    const t = tokens[i++]
    if (!t || !/^(\\d+(?:[.,]\\d*)?|[.,]\\d+)$/.test(t)) return NaN
    return sign * Number(t.replace(',', '.'))
  }
  const product = () => {
    let v = number()
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++]
      const r = number()
      v = op === '*' ? v * r : r === 0 ? NaN : v / r
    }
    return v
  }
  let result = product()
  while (tokens[i] === '+' || tokens[i] === '-') {
    const op = tokens[i++]
    const r = product()
    result = op === '+' ? result + r : result - r
  }
  if (i !== tokens.length || !Number.isFinite(result)) return null
  return Number(result.toPrecision(15))
}
`,
  hints: [
    'Шаг 1: «42» → Number(text). Шаг 2: замените запятую на точку.',
    'Разбейте строку на токены: числа и операторы. Sticky-регулярка (флаг y) не пропускает мусор между токенами.',
    'Приоритет операций — два уровня функций: product() собирает * и /, внешний цикл — + и −. Это рекурсивный спуск.',
    'Плавающая точка: 0.1+0.2 = 0.30000000000000004. Number(x.toPrecision(15)) прячет этот шум.',
  ],
  tests: [
    { name: '1. целое число', run: (api, expect) => expect(parse(api, '42')).toBe(42) },
    { name: '2. десятичная запятая', run: (api, expect) => expect(parse(api, '12,5')).toBe(12.5) },
    { name: '3. пустая строка → null', run: (api, expect) => expect(parse(api, '   ')).toBeNull() },
    { name: '4. сложение', run: (api, expect) => expect(parse(api, '2+3')).toBe(5) },
    { name: '5. приоритет умножения', run: (api, expect) => expect(parse(api, '2+3*4')).toBe(14) },
    { name: '6. пробелы и запятые', run: (api, expect) => expect(parse(api, ' 12,5 * 4 + 3 ')).toBe(53) },
    { name: '7. унарный минус', run: (api, expect) => expect(parse(api, '-3+5')).toBe(2) },
    { name: '8. незаконченное выражение → null', run: (api, expect) => expect(parse(api, '2+')).toBeNull() },
    { name: '9. мусор → null', run: (api, expect) => expect(parse(api, '2+abc')).toBeNull() },
    { name: '10. деление на ноль → null', run: (api, expect) => expect(parse(api, '1/0')).toBeNull() },
    { name: '11. шум плавающей точки скрыт', run: (api, expect) => expect(parse(api, '0,1+0,2')).toBe(0.3) },
    { name: '12. код не исполняется', run: (api, expect) => expect(parse(api, 'alert(1)')).toBeNull() },
  ],
};

export const matchMultiset: Exercise = {
  id: 'match-multiset',
  title: 'Multiset-матчинг строк ТКП',
  task: `При повторном импорте сметы нужно сопоставить новые строки с уже существующими work_items. Проблема: один код работы встречается в ТКП несколько раз («Работы до 5-и метров», «Работы выше 5-и метров»), а иногда дубли вообще одинаковые.

Наивный Map по коду теряет строки: второй дубль перезаписывает первый. Напишите matchRows(newRows, existing, keyOf), которая:
• возвращает массив той же длины, что newRows: для каждой новой строки — id спаренной существующей или null;
• каждая existing спаривается максимум один раз («потребление»);
• внутри одного ключа — по порядку (FIFO): первый дубль к первому, второй ко второму.

keyOf(row) — функция ключа (например, code + note). Это упрощённая версия matchPass из server/src/modules/analyses/constructor/diffTkp.ts.`,
  exports: ['matchRows'],
  starter: `function matchRows(newRows, existing, keyOf) {
  // Наивная версия: Map по ключу. Почему она неверна?
  const byKey = new Map(existing.map((e) => [keyOf(e), e]))
  return newRows.map((row) => byKey.get(keyOf(row))?.id ?? null)
}
`,
  solution: `function matchRows(newRows, existing, keyOf) {
  const queues = new Map()
  for (const item of existing) {
    const k = keyOf(item)
    const q = queues.get(k)
    if (q) q.push(item)
    else queues.set(k, [item])
  }
  return newRows.map((row) => {
    const q = queues.get(keyOf(row))
    const item = q?.shift()
    return item ? item.id : null
  })
}
`,
  hints: ['Вместо Map<ключ, строка> нужен Map<ключ, очередь строк>.', 'queue.shift() достаёт первую строку и одновременно «потребляет» её.'],
  tests: [
    {
      name: 'уникальные коды спариваются',
      run: (api, expect) =>
        expect(call(api, 'matchRows', [{ code: '6.1' }, { code: '6.2' }], [{ id: 'b', code: '6.2' }, { id: 'a', code: '6.1' }], (r: { code: string }) => r.code)).toEqual(['a', 'b']),
    },
    {
      name: 'дубли кода не теряются',
      run: (api, expect) =>
        expect(call(api, 'matchRows', [{ code: '6.1' }, { code: '6.1' }], [{ id: 'x', code: '6.1' }, { id: 'y', code: '6.1' }], (r: { code: string }) => r.code)).toEqual(['x', 'y']),
    },
    {
      name: 'лишняя новая строка → null (будет added)',
      run: (api, expect) =>
        expect(call(api, 'matchRows', [{ code: '6.1' }, { code: '6.1' }], [{ id: 'x', code: '6.1' }], (r: { code: string }) => r.code)).toEqual(['x', null]),
    },
    {
      name: 'ключ учитывает примечание',
      run: (api, expect) => {
        const key = (r: { code: string; note: string }) => r.code + '|' + r.note;
        expect(
          call(api, 'matchRows', [{ code: '6.1', note: 'выше 5 м' }, { code: '6.1', note: 'до 5 м' }], [{ id: 'low', code: '6.1', note: 'до 5 м' }, { id: 'high', code: '6.1', note: 'выше 5 м' }], key),
        ).toEqual(['high', 'low']);
      },
    },
  ],
};
