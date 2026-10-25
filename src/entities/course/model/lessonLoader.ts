import type { ComponentType } from 'react';

type MdxModule = { default: ComponentType };

// Каждый урок — отдельный lazy-чанк: первая загрузка сайта не тянет весь курс.
const loaders = import.meta.glob<MdxModule>('/src/content/lessons/*.mdx');

const byId = new Map(
  Object.entries(loaders).map(([path, load]) => [path.replace(/^.*\/(.+)\.mdx$/, '$1'), load]),
);

export function hasLessonContent(id: string): boolean {
  return byId.has(id);
}

export function lessonContentIds(): string[] {
  return [...byId.keys()];
}

/** Загружает MDX-урок. Возвращает null, если файла нет. */
export async function loadLesson(id: string): Promise<ComponentType | null> {
  const load = byId.get(id);
  if (!load) return null;
  return (await load()).default;
}
