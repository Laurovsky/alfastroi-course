import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { listSnippets } from './index';

it('в бандл попадают все файлы из manifest.json (включая скрытые папки вроде .github)', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../../../snippets/manifest.json'), 'utf8')) as { files: string[] };
  expect(listSnippets()).toEqual([...manifest.files].sort());
});
