import { describe, it, expect as vexpect } from 'vitest';
import { expect, runSuite, AssertionError } from './index';

describe('mini expect', () => {
  it('toBe / toEqual / not', () => {
    expect(1).toBe(1);
    expect({ a: [1, 2] }).toEqual({ a: [1, 2] });
    expect(1).not.toBe(2);
    vexpect(() => expect(1).toBe(2)).toThrow(AssertionError);
    vexpect(() => expect(1).not.toBe(1)).toThrow('Ожидали НЕ');
  });

  it('toEqual игнорирует поля undefined, но различает массив и объект', () => {
    expect({ a: 1, b: undefined }).toEqual({ a: 1 });
    vexpect(() => expect([1]).toEqual({ 0: 1 })).toThrow(AssertionError);
  });

  it('toThrow проверяет текст и класс ошибки', () => {
    class ConflictError extends Error {}
    expect(() => {
      throw new ConflictError('изменено');
    }).toThrow(ConflictError);
    expect(() => {
      throw new Error('изменено другим');
    }).toThrow('другим');
    vexpect(() => expect(() => 1).toThrow()).toThrow('без ошибки');
  });

  it('rejects.toThrow', async () => {
    await expect(Promise.reject(new Error('x'))).rejects.toThrow('x');
    await vexpect(expect(Promise.resolve(1)).rejects.toThrow()).rejects.toThrow(AssertionError);
  });
});

describe('runSuite', () => {
  const tests = [
    { name: 'складывает', run: (api: Record<string, unknown>, e: typeof expect) => e((api.sum as (a: number, b: number) => number)(2, 3)).toBe(5) },
    { name: 'ноль', run: (api: Record<string, unknown>, e: typeof expect) => e((api.sum as (a: number, b: number) => number)(0, 0)).toBe(0) },
  ];

  it('зелёный набор', async () => {
    const r = await runSuite('function sum(a, b) { return a + b }', ['sum'], tests);
    vexpect(r.passed).toBe(true);
    vexpect(r.results.map((x) => x.passed)).toEqual([true, true]);
  });

  it('красный тест не останавливает остальные', async () => {
    const r = await runSuite('function sum(a, b) { return a * b }', ['sum'], tests);
    vexpect(r.passed).toBe(false);
    vexpect(r.results.map((x) => x.passed)).toEqual([false, true]);
    vexpect(r.results[0].error).toContain('ожидали 5');
  });

  it('синтаксическая ошибка и отсутствующий экспорт → compileError', async () => {
    vexpect((await runSuite('function sum(', ['sum'], tests)).compileError).toContain('SyntaxError');
    vexpect((await runSuite('const x = 1', ['sum'], tests)).compileError).toContain('sum');
  });
});
