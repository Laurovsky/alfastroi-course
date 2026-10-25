import { describe, it, expect } from 'vitest';
import { findSuspiciousChars, runSuite } from '@/shared/lib/mini-test';
import { listExercises } from './registry';

/**
 * Тесты на сами упражнения (TDD для курса): эталон обязан проходить все тесты,
 * заготовка — падать хотя бы на одном. Иначе упражнение либо сломано, либо решено заранее.
 */
describe.each(listExercises().map((e) => [e.id, e] as const))('упражнение %s', (_id, exercise) => {
  it('эталонное решение проходит все тесты', async () => {
    const result = await runSuite(exercise.solution, exercise.exports, exercise.tests);
    expect(result.compileError).toBeNull();
    expect(result.results.filter((r) => !r.passed)).toEqual([]);
  });

  it('заготовка не проходит хотя бы один тест', async () => {
    const result = await runSuite(exercise.starter, exercise.exports, exercise.tests);
    expect(result.passed).toBe(false);
  });

  it('в эталоне и заготовке нет невидимых и «похожих» символов', () => {
    expect(findSuspiciousChars(exercise.solution)).toEqual([]);
    expect(findSuspiciousChars(exercise.starter)).toEqual([]);
  });

  it('есть условие, подсказки и тесты', () => {
    expect(exercise.task.length).toBeGreaterThan(50);
    expect(exercise.hints.length).toBeGreaterThan(0);
    expect(exercise.tests.length).toBeGreaterThan(1);
  });
});

it('id упражнений уникальны', () => {
  const ids = listExercises().map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
});
