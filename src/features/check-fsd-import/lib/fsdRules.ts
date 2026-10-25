/**
 * Упрощённая копия правил из client/scripts/frontend-boundaries.mjs Альфастрой
 * (без разрешения путей и legacy-исключений). Используется интерактивным чекером.
 */
export const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'] as const;
export type Layer = (typeof layers)[number];
const sliceLayers = new Set<Layer>(['widgets', 'features', 'entities']);

export type Rule = 'fsd-layer' | 'fsd-slice' | 'fsd-public-api';

export interface Violation {
  rule: Rule;
  message: string;
}

export interface FileMeta {
  layer: Layer;
  slice: string | null;
}

export function fileMeta(file: string): FileMeta | null {
  const parts = file.replace(/^\/+/, '').split('/');
  if (parts[0] !== 'src') return null;
  const layer = parts[1] as Layer;
  if (!layers.includes(layer)) return null;
  return { layer, slice: sliceLayers.has(layer) ? (parts[2] ?? null) : null };
}

export function checkImport(fromFile: string, targetFile: string, typeOnly = false): Violation[] {
  const from = fileMeta(fromFile);
  const to = fileMeta(targetFile);
  const violations: Violation[] = [];
  if (!to) return violations;
  const target = targetFile.replace(/^\/+/, '').replace(/\.[jt]sx?$/, '');

  if (from && layers.indexOf(to.layer) < layers.indexOf(from.layer))
    violations.push({
      rule: 'fsd-layer',
      message: `Слой «${from.layer}» не может импортировать вышестоящий «${to.layer}». Зависимости идут только вниз: app → pages → widgets → features → entities → shared.`,
    });

  const sameSlice = !!from && from.layer === to.layer && from.slice === to.slice;
  const crossEntity =
    !!from &&
    from.layer === 'entities' &&
    to.layer === 'entities' &&
    typeOnly &&
    target === `src/entities/${to.slice}/@x/${from.slice}`;

  if (from && from.layer === to.layer && sliceLayers.has(from.layer) && !sameSlice && !crossEntity)
    violations.push({
      rule: 'fsd-slice',
      message: `Слайсы одного слоя изолированы: «${from.layer}/${from.slice}» не импортирует «${to.layer}/${to.slice}». Поднимите композицию на слой выше${
        from.layer === 'entities' ? ' или используйте type-only импорт через @x' : ''
      }.`,
    });

  if (sliceLayers.has(to.layer) && !sameSlice && !crossEntity && target !== `src/${to.layer}/${to.slice}/index`)
    violations.push({
      rule: 'fsd-public-api',
      message: `Импорт в обход публичного API: используйте «@/${to.layer}/${to.slice}» (index.ts), внутренние файлы слайса приватны.`,
    });

  return violations;
}
