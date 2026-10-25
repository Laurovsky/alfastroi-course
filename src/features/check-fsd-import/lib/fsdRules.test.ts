import { describe, it, expect } from 'vitest';
import { checkImport, fileMeta } from './fsdRules';

const rules = (from: string, to: string, typeOnly = false) => checkImport(from, to, typeOnly).map((v) => v.rule);

describe('fsdRules', () => {
  it('fileMeta', () => {
    expect(fileMeta('src/features/edit-analysis/model/x.ts')).toEqual({ layer: 'features', slice: 'edit-analysis' });
    expect(fileMeta('src/shared/api/api.ts')).toEqual({ layer: 'shared', slice: null });
    expect(fileMeta('src/lib/legacy.ts')).toBeNull();
  });

  it('разрешённые импорты', () => {
    expect(rules('src/widgets/analysis-editor/ui/A.tsx', 'src/entities/analysis/index.ts')).toEqual([]);
    expect(rules('src/features/a/model/x.ts', 'src/features/a/lib/y.ts')).toEqual([]);
    expect(rules('src/entities/execution/model/t.ts', 'src/entities/catalog/@x/execution.ts', true)).toEqual([]);
  });

  it('нарушения', () => {
    expect(rules('src/shared/api/api.ts', 'src/entities/catalog/index.ts')).toEqual(['fsd-layer']);
    expect(rules('src/features/a/x.ts', 'src/features/b/index.ts')).toEqual(['fsd-slice']);
    expect(rules('src/pages/p/P.tsx', 'src/widgets/w/model/store.ts')).toEqual(['fsd-public-api']);
    expect(rules('src/entities/execution/model/t.ts', 'src/entities/catalog/@x/execution.ts')).toEqual(['fsd-slice', 'fsd-public-api']);
  });
});
