export interface ExcerptOptions {
  /** Подстрока первой строки фрагмента (например, `export function deriveRowType`). */
  from?: string;
  /**
   * Подстрока последней строки (включительно). Если не задана — фрагмент
   * заканчивается, когда закрываются все фигурные скобки, открытые начиная с `from`.
   */
  to?: string;
  /** Захватить JSDoc-комментарий, стоящий прямо над `from`. По умолчанию true. */
  withDoc?: boolean;
}

export interface Excerpt {
  code: string;
  /** Номер первой строки в исходном файле (с 1). */
  startLine: number;
  endLine: number;
}

/** Ищет закрытие блока, считая `{`/`}` вне строк и комментариев (упрощённо, без regex-литералов). */
function findBlockEnd(lines: string[], start: number): number {
  let depth = 0;
  let opened = false;
  let inBlockComment = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    let quote: string | null = null;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const next = line[j + 1];
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          j++;
        }
        continue;
      }
      if (quote) {
        if (ch === '\\') j++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        j++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
        if (opened && depth === 0) return i;
      }
    }
  }
  return -1;
}

/** Вырезает фрагмент файла по маркерам. Бросает Error, если маркер не найден (это ловят тесты курса). */
export function excerpt(source: string, options: ExcerptOptions = {}): Excerpt {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (!options.from) {
    const trimmed = lines.length > 0 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
    return { code: trimmed.join('\n'), startLine: 1, endLine: trimmed.length };
  }

  const start = lines.findIndex((l) => l.includes(options.from!));
  if (start === -1) throw new Error(`excerpt: не найдена строка «${options.from}»`);

  let end: number;
  if (options.to) {
    const rel = lines.slice(start).findIndex((l) => l.includes(options.to!));
    if (rel === -1) throw new Error(`excerpt: не найдена конечная строка «${options.to}»`);
    end = start + rel;
  } else {
    end = findBlockEnd(lines, start);
    if (end === -1) throw new Error(`excerpt: не удалось найти конец блока после «${options.from}»`);
  }

  let docStart = start;
  if (options.withDoc !== false && start > 0 && lines[start - 1].trim().endsWith('*/')) {
    for (let i = start - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith('/**') || lines[i].trim().startsWith('/*')) {
        docStart = i;
        break;
      }
    }
  }

  const chunk = lines.slice(docStart, end + 1);
  const indent = Math.min(
    ...chunk.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length),
  );
  return {
    code: chunk.map((l) => l.slice(indent)).join('\n'),
    startLine: docStart + 1,
    endLine: end + 1,
  };
}
