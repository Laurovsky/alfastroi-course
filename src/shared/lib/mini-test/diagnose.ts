import { parse } from 'acorn';

export interface SuspiciousChar {
  char: string;
  /** Например `U+200B`. */
  codePoint: string;
  /** Строка и столбец с 1, как в редакторе. */
  line: number;
  column: number;
  hint: string;
}

export interface SyntaxLocation {
  line: number;
  column: number;
  message: string;
}

const INVISIBLE = new Set([0x00a0, 0x2007, 0x202f, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x3000, 0x00ad]);
const SINGLE_QUOTES = new Set(['‘', '’', '‚', '‛', '′']);
const DOUBLE_QUOTES = new Set(['“', '”', '„', '«', '»', '″']);
const DOTS = new Set(['․', '。', '‥', '…']);
const DASHES = new Set(['–', '—', '‒', '−']);
const ARROWS: Record<string, string> = { '⇒': '=>', '→': '=>', '≥': '>=', '≤': '<=', '≠': '!==' };
/** Кириллические буквы, неотличимые от латинских на глаз. */
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', і: 'i', к: 'k', м: 'm', т: 't', н: 'h',
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
};

function hintFor(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (INVISIBLE.has(cp)) return 'невидимый или неразрывный пробел (часто попадает при копировании из мессенджеров и PDF) — удалите его и наберите обычный пробел';
  if (SINGLE_QUOTES.has(ch)) return "типографская кавычка — замените на обычную '";
  if (DOUBLE_QUOTES.has(ch)) return "типографская кавычка — замените на обычную \" или '";
  if (DOTS.has(ch)) return 'похожий на точку символ — замените на обычную точку .';
  if (DASHES.has(ch)) return 'длинное тире вместо минуса — замените на обычный дефис-минус -';
  if (ARROWS[ch]) return `символ-стрелка — в коде пишется ${ARROWS[ch]}`;
  if (cp >= 0xff01 && cp <= 0xff5e) return `полноширинный символ — замените на обычный «${String.fromCodePoint(cp - 0xfee0)}»`;
  if (/[Ѐ-ӿ]/.test(ch)) {
    const latin = CYRILLIC_LOOKALIKES[ch];
    return latin
      ? `кириллическая буква «${ch}» выглядит как латинская «${latin}» — переключите раскладку и наберите латинскую`
      : `кириллическая буква «${ch}» вне строки — в именах переменных и функций используйте латиницу`;
  }
  return 'необычный символ вне строки и комментария — проверьте, не попал ли он при копировании';
}

/**
 * Ищет символы, которые выглядят как обычный код, но им не являются:
 * невидимые пробелы, типографские кавычки, полноширинные скобки, кириллицу в именах.
 * Внутри строк и комментариев не-ASCII символы законны и не учитываются.
 */
export function findSuspiciousChars(code: string): SuspiciousChar[] {
  const found: SuspiciousChar[] = [];
  let state: 'code' | "'" | '"' | '`' | 'line' | 'block' = 'code';
  let line = 1;
  let column = 0;

  const chars = Array.from(code);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    column++;

    if (state === 'code') {
      if (ch === '/' && next === '/') state = 'line';
      else if (ch === '/' && next === '*') state = 'block';
      else if (ch === "'" || ch === '"' || ch === '`') state = ch;
      else {
        const cp = ch.codePointAt(0)!;
        if (cp > 127 || INVISIBLE.has(cp)) {
          found.push({ char: ch, codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, line, column, hint: hintFor(ch) });
        }
      }
    } else if (state === 'line') {
      if (ch === '\n') state = 'code';
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i++;
        column++;
      }
    } else {
      // Внутри строки: экранирование пропускает следующий символ, перевод строки завершает '' и "".
      if (ch === '\\') {
        i++;
        column++;
      } else if (ch === state || (ch === '\n' && state !== '`')) state = 'code';
    }

    if (ch === '\n') {
      line++;
      column = 0;
    }
  }
  return found;
}

/** Точное место синтаксической ошибки (строка и столбец с 1) или null, если синтаксис корректен. */
export function locateSyntaxError(code: string): SyntaxLocation | null {
  try {
    parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    return null;
  } catch (err) {
    const loc = (err as { loc?: { line: number; column: number } }).loc;
    if (!loc) return null;
    return { line: loc.line, column: loc.column + 1, message: (err as Error).message.replace(/\s*\(\d+:\d+\)$/, '') };
  }
}

/**
 * Код Альфастрой — TypeScript, упражнения — JavaScript. Если ученик переписал код
 * из урока вместе с типами, подсказываем, какую TypeScript-конструкцию убрать.
 * Смотрим только на строку с синтаксической ошибкой, чтобы не путать с тернарником или объектом.
 */
function typescriptHint(line: string): string | null {
  const nonNull = /([\w)\]]+)!(?=[.[(])/.exec(line);
  if (nonNull)
    return `«${nonNull[1]}!» — это non-null assertion из TypeScript («точно не null»). В JavaScript такой записи нет: уберите «!»`;
  const param = /[(,]\s*\w+\??\s*(:\s*[\w<>[\]|' ]+?)\s*(?=[,)=])/.exec(line);
  if (param) return `«${param[1].trim()}» — аннотация типа из TypeScript. В JavaScript типов нет: удалите «${param[1].trim()}»`;
  const returnType = /\)\s*(:\s*[\w<>[\]| ]+?)\s*(?=\{|=>)/.exec(line);
  if (returnType) return `«${returnType[1].trim()}» — тип результата из TypeScript. В JavaScript удалите его`;
  const cast = /\bas\s+[A-Z][\w<>[\]]*/.exec(line);
  if (cast) return `«${cast[0]}» — приведение типа из TypeScript. В JavaScript удалите его`;
  if (/^\s*(export\s+)?(interface|type)\s+\w+/.test(line)) return 'объявления interface/type есть только в TypeScript. В JavaScript удалите их';
  return null;
}

/** Человекочитаемые строки диагностики для вывода под ошибкой. */
export function describeProblems(code: string, options: { syntax: boolean }): string[] {
  const lines: string[] = [];
  if (options.syntax) {
    const loc = locateSyntaxError(code);
    if (loc) {
      const source = code.split('\n')[loc.line - 1] ?? '';
      lines.push(`Ошибка синтаксиса: строка ${loc.line}, столбец ${loc.column}`);
      lines.push(`  ${source}`);
      lines.push(`  ${' '.repeat(Math.max(0, loc.column - 1))}^`);
      const ts = typescriptHint(source);
      if (ts) lines.push(`Похоже на синтаксис TypeScript: ${ts}. Упражнения выполняются как обычный JavaScript.`);
    }
  }
  const suspicious = findSuspiciousChars(code);
  for (const s of suspicious.slice(0, 5)) {
    const shown = INVISIBLE.has(s.char.codePointAt(0)!) ? '·' : s.char;
    lines.push(`Строка ${s.line}, столбец ${s.column}: символ «${shown}» (${s.codePoint}) — ${s.hint}`);
  }
  if (suspicious.length > 5) lines.push(`…и ещё ${suspicious.length - 5} таких символов`);
  return lines;
}
