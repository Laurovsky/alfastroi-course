/**
 * Минимальный `expect` в стиле Vitest/Jest для упражнений в браузере.
 * Бросает AssertionError с понятным русским сообщением — его видит ученик.
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function format(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Error) return `${value.name}(${JSON.stringify(value.message)})`;
  if (value instanceof Set) return `Set(${format([...value])})`;
  if (value instanceof Map) return `Map(${format([...value])})`;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((x) => b.has(x));
  if (a instanceof Map && b instanceof Map)
    return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)));
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toContain(item: unknown): void;
  toHaveLength(length: number): void;
  toBeGreaterThan(n: number): void;
  toBeLessThan(n: number): void;
  /** Для функции: ожидаем исключение; `expected` — подстрока сообщения или класс ошибки. */
  toThrow(expected?: string | (new (...args: never[]) => Error)): void;
  toBeInstanceOf(cls: new (...args: never[]) => unknown): void;
}

export interface Expectation extends Matchers {
  not: Matchers;
  /** Для промиса: ожидаем reject; проверки как у toThrow. */
  rejects: { toThrow(expected?: string | (new (...args: never[]) => Error)): Promise<void> };
}

function matchesError(err: unknown, expected?: string | (new (...args: never[]) => Error)): boolean {
  if (expected === undefined) return true;
  if (typeof expected === 'string') return err instanceof Error && err.message.includes(expected);
  return err instanceof expected || (err instanceof Error && err.name === expected.name);
}

function describeExpected(expected?: string | (new (...args: never[]) => Error)): string {
  if (expected === undefined) return 'исключение';
  return typeof expected === 'string' ? `исключение с текстом ${format(expected)}` : `исключение ${expected.name}`;
}

function build(actual: unknown, negate: boolean): Matchers {
  const check = (pass: boolean, message: string) => {
    if (pass === negate) throw new AssertionError(negate ? `Ожидали НЕ: ${message}` : message);
  };
  return {
    toBe: (e) => check(Object.is(actual, e), `ожидали ${format(e)}, получили ${format(actual)}`),
    toEqual: (e) => check(deepEqual(actual, e), `ожидали ${format(e)}, получили ${format(actual)}`),
    toBeNull: () => check(actual === null, `ожидали null, получили ${format(actual)}`),
    toBeTruthy: () => check(Boolean(actual), `ожидали истинное значение, получили ${format(actual)}`),
    toBeFalsy: () => check(!actual, `ожидали ложное значение, получили ${format(actual)}`),
    toContain: (item) =>
      check(
        (typeof actual === 'string' && typeof item === 'string' && actual.includes(item)) ||
          (Array.isArray(actual) && actual.some((x) => deepEqual(x, item))),
        `ожидали, что ${format(actual)} содержит ${format(item)}`,
      ),
    toHaveLength: (n) => {
      const len = (actual as { length?: unknown } | null)?.length;
      check(len === n, `ожидали длину ${n}, получили ${format(len)}`);
    },
    toBeGreaterThan: (n) => check(typeof actual === 'number' && actual > n, `ожидали > ${n}, получили ${format(actual)}`),
    toBeLessThan: (n) => check(typeof actual === 'number' && actual < n, `ожидали < ${n}, получили ${format(actual)}`),
    toThrow: (expected) => {
      if (typeof actual !== 'function') throw new AssertionError('toThrow ожидает функцию: expect(() => fn()).toThrow()');
      let thrown: unknown = undefined;
      let didThrow = false;
      try {
        (actual as () => unknown)();
      } catch (err) {
        didThrow = true;
        thrown = err;
      }
      check(
        didThrow && matchesError(thrown, expected),
        didThrow
          ? `ожидали ${describeExpected(expected)}, получили ${format(thrown)}`
          : `ожидали ${describeExpected(expected)}, но функция завершилась без ошибки`,
      );
    },
    toBeInstanceOf: (cls) => check(actual instanceof cls, `ожидали экземпляр ${cls.name}, получили ${format(actual)}`),
  };
}

export function expect(actual: unknown): Expectation {
  return {
    ...build(actual, false),
    not: build(actual, true),
    rejects: {
      async toThrow(expected) {
        try {
          await actual;
        } catch (err) {
          if (!matchesError(err, expected))
            throw new AssertionError(`ожидали ${describeExpected(expected)}, получили ${format(err)}`);
          return;
        }
        throw new AssertionError(`ожидали reject (${describeExpected(expected)}), но промис выполнился успешно`);
      },
    },
  };
}

export type Expect = typeof expect;
