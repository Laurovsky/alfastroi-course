/**
 * Исходники Альфастрой, скопированные в /snippets скриптом `npm run sync-snippets`.
 * Ключ — путь относительно корня репозитория Альфастрой (`server/src/lib/versionCheck.ts`).
 * Файлы включаются в бандл как строки (Vite `?raw`), сеть не нужна.
 */
// Скрытые папки (.github) glob пропускает, поэтому для них — отдельный явный шаблон.
const modules = import.meta.glob(['/snippets/**/*.{ts,tsx,mjs,sql,json,yml}', '/snippets/.github/**/*.yml', '!/snippets/manifest.json'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byPath = new Map<string, string>(
  Object.entries(modules).map(([key, value]) => [key.replace(/^\/snippets\//, ''), value]),
);

export function getSnippet(path: string): string | undefined {
  return byPath.get(path);
}

export function listSnippets(): string[] {
  return [...byPath.keys()].sort();
}

export function languageOf(path: string): string {
  const ext = path.split('.').pop() ?? '';
  if (ext === 'mjs') return 'javascript';
  if (ext === 'yml') return 'yaml';
  return ext;
}
