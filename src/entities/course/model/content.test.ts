import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { mdxOptions } from '../../../../mdx.config';
import { excerpt } from '@/shared/lib/excerpt';
import { getExercise } from '@/entities/exercise';
import { allLessons } from './curriculum';
import { getDokaArticle } from './doka';

/**
 * Целостность контента: курс тоже покрыт тестами.
 * Если после синхронизации кода Альфастрой маркер фрагмента «уехал»,
 * этот тест упадёт в CI раньше, чем ученик увидит битый урок.
 */
const lessonsDir = join(__dirname, '../../../content/lessons');
const snippetsDir = join(__dirname, '../../../../snippets');
const files = readdirSync(lessonsDir).filter((f) => f.endsWith('.mdx'));
const read = (f: string) => readFileSync(join(lessonsDir, f), 'utf8');

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag) ?? new RegExp(`\\b${name}=\\{'([^']*)'\\}`).exec(tag);
  return m?.[1].replace(/&quot;/g, '"');
}

describe('уроки', () => {
  it('у каждого урока учебного плана есть MDX-файл, и лишних файлов нет', () => {
    expect(files.map((f) => f.replace('.mdx', '')).sort()).toEqual(allLessons.map((l) => l.id).sort());
  });

  it('id уроков уникальны', () => {
    const ids = allLessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(files)('%s: все фрагменты <Source> находятся', (file) => {
    const tags = read(file).match(/<Source\b[^>]*\/>/g) ?? [];
    for (const tag of tags) {
      const path = attr(tag, 'path');
      expect(path, tag).toBeTruthy();
      const source = readFileSync(join(snippetsDir, path!), 'utf8');
      expect(() => excerpt(source, { from: attr(tag, 'from'), to: attr(tag, 'to') }), tag).not.toThrow();
    }
  });

  it.each(files)('%s: упражнения существуют', (file) => {
    for (const [, id] of read(file).matchAll(/<Exercise id="([^"]+)"/g)) expect(getExercise(id), id).toBeTruthy();
  });

  it.each(files)('%s: markdown-таблицы компилируются в <table>', async (file) => {
    const source = read(file);
    // Разделитель заголовка таблицы GFM: строка вида |---|---|
    const expected = source.match(/^\|[\s:|-]+\|\s*$/gm)?.length ?? 0;
    const compiled = String(await compile(source, mdxOptions));
    const tables = compiled.match(/\(_components\.table,/g)?.length ?? 0;
    expect(tables).toBe(expected);
  });

  it.each(files)('%s: цитаты <Doka> ссылаются на статьи из реестра', (file) => {
    for (const [, from] of read(file).matchAll(/<Doka from="([^"]+)"/g)) expect(getDokaArticle(from), from).toBeTruthy();
  });

  it('в каждом уроке есть хотя бы одна цитата из Доки и блок «Главное»', () => {
    const missing = files.filter((f) => !read(f).includes('<Doka ') || !read(f).includes('kind="key"'));
    expect(missing).toEqual([]);
  });

  it('id квизов уникальны по всему курсу', () => {
    const ids = files.flatMap((f) => [...read(f).matchAll(/<Quiz\s+id="([^"]+)"/g)].map((m) => m[1]));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('каждое упражнение используется хотя бы в одном уроке', async () => {
    const used = new Set(files.flatMap((f) => [...read(f).matchAll(/<Exercise id="([^"]+)"/g)].map((m) => m[1])));
    const { listExercises } = await import('@/entities/exercise');
    expect(listExercises().map((e) => e.id).filter((id) => !used.has(id))).toEqual([]);
  });
});
