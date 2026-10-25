#!/usr/bin/env node
// Копирует фрагменты исходников Альфастрой в snippets/ по manifest.json.
// Использование: npm run sync-snippets -- ../alfastroi
// Курс читает только snippets/, поэтому сайт собирается без доступа к приватному репо.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const snippetsDir = resolve(here, '../snippets');
const source = resolve(process.argv[2] ?? '../alfastroi');
const { files } = JSON.parse(readFileSync(join(snippetsDir, 'manifest.json'), 'utf8'));

// Публичный курс не должен рекламировать production-хосты: заменяем их нейтральной меткой.
const redact = (text) =>
  text
    .replace(/https:\/\/[a-z0-9.-]+\.alfastroi\.site/g, 'https://api.example.com')
    .replace(/https:\/\/[a-z0-9.-]+\.up\.railway\.app/g, 'https://legacy.example.com')
    .replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, 'https://project.supabase.co');

let missing = 0;
for (const file of files) {
  const from = join(source, file);
  if (!existsSync(from)) {
    console.error(`✗ нет файла: ${file}`);
    missing++;
    continue;
  }
  const to = join(snippetsDir, file);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, redact(readFileSync(from, 'utf8')));
  console.log(`✓ ${file}`);
}
if (missing) process.exit(1);
