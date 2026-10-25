import { useMemo } from 'react';
import { excerpt, type ExcerptOptions } from '@/shared/lib/excerpt';
import { getSnippet, languageOf } from '@/shared/lib/snippets';
import { Code } from './Code';

export interface SourceProps extends ExcerptOptions {
  /** Путь в репозитории Альфастрой, например `server/src/lib/versionCheck.ts`. */
  path: string;
  /** Подсветить строки, содержащие эти подстроки. */
  mark?: string[];
}

/**
 * Настоящий код проекта: берёт файл из /snippets и вырезает фрагмент по маркерам.
 * Если маркер «уехал» после рефакторинга — показывает ошибку (а тест курса падает).
 */
export function Source({ path, from, to, withDoc, mark = [] }: SourceProps) {
  const result = useMemo(() => {
    const file = getSnippet(path);
    if (file === undefined) return { error: `Файл ${path} не синхронизирован (npm run sync-snippets)` } as const;
    try {
      return excerpt(file, { from, to, withDoc });
    } catch (e) {
      return { error: `${path}: ${(e as Error).message}` } as const;
    }
  }, [path, from, to, withDoc]);

  if ('error' in result) return <div className="callout callout--danger">{result.error}</div>;

  const highlight = mark.length
    ? result.code
        .split('\n')
        .map((line, i) => (mark.some((m) => line.includes(m)) ? result.startLine + i : -1))
        .filter((n) => n > 0)
    : [];

  return (
    <Code
      code={result.code}
      lang={languageOf(path)}
      title={`${path}${result.startLine > 1 ? `:${result.startLine}` : ''}`}
      startLine={result.startLine}
      highlight={highlight}
    />
  );
}
