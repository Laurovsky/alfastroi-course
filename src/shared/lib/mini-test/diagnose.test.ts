import { describe, it, expect } from 'vitest';
import { findSuspiciousChars, locateSyntaxError } from './diagnose';
import { runSuite } from './runner';

const solution = `function formatDisplayName(lastName, firstName, middleName) {
  if (!lastName && !firstName) return '—'
  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((n) => n[0].toUpperCase() + '.')
    .join(' ')
  return initials ? lastName + ' ' + initials : lastName
}`;

describe('findSuspiciousChars', () => {
  it('не ругается на обычный код и на не-ASCII внутри строк и комментариев', () => {
    expect(findSuspiciousChars(solution)).toEqual([]);
    expect(findSuspiciousChars("// комментарий «ёлки»\nconst s = 'Иванов И. П.' + `${'—'}`")).toEqual([]);
  });

  it('находит невидимый пробел нулевой ширины с номером строки и столбца', () => {
    const code = solution.replace('    .map', '    ​.map');
    const [hit] = findSuspiciousChars(code);
    expect(hit).toMatchObject({ line: 5, column: 5, codePoint: 'U+200B' });
    expect(hit.hint).toContain('невидимый');
  });

  it('находит типографские кавычки и подсказывает замену', () => {
    const [hit] = findSuspiciousChars("const a = ’x’");
    expect(hit).toMatchObject({ char: '’', line: 1, column: 11 });
    expect(hit.hint).toContain("'");
  });

  it('находит кириллическую букву, похожую на латинскую, в имени', () => {
    const [hit] = findSuspiciousChars('сonst a = 1'); // первая «с» — кириллица
    expect(hit).toMatchObject({ char: 'с', line: 1, column: 1 });
    expect(hit.hint).toContain('латинск');
  });

  it('находит полноширинную скобку', () => {
    expect(findSuspiciousChars('f（1)')[0]).toMatchObject({ char: '（', column: 2 });
  });
});

describe('locateSyntaxError', () => {
  it('возвращает строку и столбец синтаксической ошибки', () => {
    expect(locateSyntaxError('const a = (1 +\n  2')).toMatchObject({ line: 2 });
    expect(locateSyntaxError(solution)).toBeNull();
  });
});

describe('runSuite с диагностикой', () => {
  const tests = [{ name: 't', run: () => {} }];

  it('при синтаксической ошибке объясняет, где она и какой символ виноват', async () => {
    const r = await runSuite(solution.replace('    .map', '    ​.map'), ['formatDisplayName'], tests);
    expect(r.compileError).toContain('SyntaxError');
    expect(r.diagnostics.join('\n')).toContain('строка 5');
    expect(r.diagnostics.join('\n')).toContain('U+200B');
  });

  it('если объявление «не найдено» из-за кириллицы в имени — подсказывает это', async () => {
    const r = await runSuite('function formatDisplayNаme() {}', ['formatDisplayName'], tests); // «а» — кириллица
    expect(r.compileError).toContain('Не найдено');
    expect(r.diagnostics.join('\n')).toContain('кирилл');
  });

  it('у корректного кода диагностики нет', async () => {
    const r = await runSuite(solution, ['formatDisplayName'], tests);
    expect(r.diagnostics).toEqual([]);
  });
});
