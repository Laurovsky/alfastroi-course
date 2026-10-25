import remarkGfm from 'remark-gfm';
import type { CompileOptions } from '@mdx-js/mdx';

/**
 * Общие настройки MDX для сборки и тестов.
 * remark-gfm включает таблицы, зачёркивание и автоссылки GitHub Flavored Markdown —
 * без него MDX 3 выводит строки таблиц как обычный текст с символами «|».
 */
export const mdxOptions = {
  providerImportSource: '@mdx-js/react',
  remarkPlugins: [remarkGfm],
} satisfies CompileOptions;
