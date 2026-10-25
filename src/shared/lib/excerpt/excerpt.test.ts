import { describe, it, expect } from 'vitest';
import { excerpt } from './excerpt';

const src = `import x from 'y'

/**
 * Документация.
 */
export function a(s: string) {
  const o = { k: '}' } // скобка в строке и в комментарии }
  return o
}

export function b() {
  return 2
}
`;

describe('excerpt', () => {
  it('без маркеров возвращает файл целиком', () => {
    expect(excerpt('a\nb\n')).toEqual({ code: 'a\nb', startLine: 1, endLine: 2 });
  });

  it('вырезает функцию по балансу скобок и захватывает JSDoc', () => {
    const r = excerpt(src, { from: 'export function a' });
    expect(r.code.startsWith('/**')).toBe(true);
    expect(r.code.endsWith('return o\n}')).toBe(true);
    expect(r.startLine).toBe(3);
    expect(r.endLine).toBe(9);
  });

  it('withDoc: false и явный маркер to', () => {
    const r = excerpt(src, { from: 'export function b', to: 'return 2', withDoc: false });
    expect(r.code).toBe('export function b() {\n  return 2');
  });

  it('снимает общий отступ', () => {
    expect(excerpt('class A {\n  m() {\n    return 1\n  }\n}', { from: 'm()' }).code).toBe('m() {\n  return 1\n}');
  });

  it('бросает ошибку, если маркер не найден', () => {
    expect(() => excerpt(src, { from: 'нет такого' })).toThrow('не найдена');
  });
});
