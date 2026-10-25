import { describeProblems } from './diagnose';
import { expect, type Expect } from './expect';

/** Один тест упражнения. `api` — то, что экспортировал код ученика. */
export interface TestCase {
  name: string;
  run: (api: Record<string, unknown>, expect: Expect) => void | Promise<void>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
}

export interface SuiteResult {
  /** Ошибка компиляции/выполнения самого кода (синтаксис, ReferenceError на верхнем уровне). */
  compileError: string | null;
  /** Подсказки к compileError: место синтаксической ошибки, подозрительные символы. Пусто, если ошибки нет. */
  diagnostics: string[];
  results: TestResult[];
  passed: boolean;
}

const TEST_TIMEOUT_MS = 2000;

/**
 * Выполняет код ученика и достаёт из него именованные значения.
 * Код — обычный JavaScript; `exports` перечисляет имена функций/классов,
 * которые должны быть объявлены на верхнем уровне.
 */
export function evaluateModule(code: string, exportNames: string[]): Record<string, unknown> {
  const picks = exportNames
    .map((name) => `${JSON.stringify(name)}: typeof ${name} === 'undefined' ? undefined : ${name}`)
    .join(',\n');
  // Код ученика выполняется только в его браузере (в Web Worker) — это учебная песочница.
  const factory = new Function(`"use strict";\n${code}\n;return {\n${picks}\n};`);
  return factory() as Record<string, unknown>;
}

function message(err: unknown): string {
  if (err instanceof Error) return err.name === 'AssertionError' ? err.message : `${err.name}: ${err.message}`;
  return String(err);
}

function withTimeout(p: Promise<void>): Promise<void> {
  return Promise.race([
    p,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`тест не завершился за ${TEST_TIMEOUT_MS} мс`)), TEST_TIMEOUT_MS),
    ),
  ]);
}

/** Запускает все тесты по порядку. Падение одного теста не останавливает остальные. */
export async function runSuite(code: string, exportNames: string[], tests: TestCase[]): Promise<SuiteResult> {
  let api: Record<string, unknown>;
  try {
    api = evaluateModule(code, exportNames);
  } catch (err) {
    const syntax = err instanceof Error && err.name === 'SyntaxError';
    return { compileError: message(err), diagnostics: describeProblems(code, { syntax }), results: [], passed: false };
  }

  const missing = exportNames.filter((name) => api[name] === undefined);
  if (missing.length > 0) {
    return {
      compileError: `Не найдено объявление: ${missing.join(', ')}. Объявите их на верхнем уровне (function/class/const).`,
      // Частая причина «не найдено» — кириллическая буква в имени, которую не видно глазом.
      diagnostics: describeProblems(code, { syntax: false }),
      results: [],
      passed: false,
    };
  }

  const results: TestResult[] = [];
  for (const test of tests) {
    try {
      await withTimeout(Promise.resolve().then(() => test.run(api, expect)));
      results.push({ name: test.name, passed: true, error: null });
    } catch (err) {
      results.push({ name: test.name, passed: false, error: message(err) });
    }
  }
  return { compileError: null, diagnostics: [], results, passed: results.length > 0 && results.every((r) => r.passed) };
}
