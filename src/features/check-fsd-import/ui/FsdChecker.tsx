import { useId, useState } from 'react';
import { checkImport, fileMeta, layers } from '../lib/fsdRules';

const presets: Array<{ label: string; from: string; to: string; typeOnly?: boolean }> = [
  { label: 'Виджет берёт сущность через index', from: 'src/widgets/analysis-editor/ui/AnalysisEditor.tsx', to: 'src/entities/analysis/index.ts' },
  { label: 'shared тянется к entities', from: 'src/shared/api/api.ts', to: 'src/entities/catalog/index.ts' },
  { label: 'Фича импортирует соседнюю фичу', from: 'src/features/edit-allocations/model/useAllocationsModel.ts', to: 'src/features/manage-additional-acts/index.ts' },
  { label: 'Страница лезет внутрь виджета', from: 'src/pages/analysis/AnalysisConstructor.tsx', to: 'src/widgets/analysis-editor/model/useAnalysisEditorModel.ts' },
  { label: 'Тип сущности через @x (type-only)', from: 'src/entities/execution/model/types.ts', to: 'src/entities/catalog/@x/execution.ts', typeOnly: true },
  { label: 'То же @x, но runtime-импорт', from: 'src/entities/execution/model/types.ts', to: 'src/entities/catalog/@x/execution.ts' },
];

/** Песочница: введите два пути и посмотрите, что скажет линтер границ. */
export function FsdChecker() {
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [typeOnly, setTypeOnly] = useState(false);
  const ids = { from: useId(), to: useId(), preset: useId() };
  const violations = checkImport(from, to, typeOnly);
  const fromMeta = fileMeta(from);
  const toMeta = fileMeta(to);

  return (
    <section className="widget">
      <header className="widget__head">
        <span className="widget__badge">Интерактив</span> Проверка импорта по правилам FSD
      </header>
      <label className="field" htmlFor={ids.preset}>
        <span>Пример</span>
        <select
          id={ids.preset}
          onChange={(e) => {
            const p = presets[Number(e.target.value)];
            setFrom(p.from);
            setTo(p.to);
            setTypeOnly(Boolean(p.typeOnly));
          }}
        >
          {presets.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor={ids.from}>
        <span>Файл, который импортирует</span>
        <input id={ids.from} value={from} onChange={(e) => setFrom(e.target.value)} spellCheck={false} />
      </label>
      <label className="field" htmlFor={ids.to}>
        <span>Что импортируем</span>
        <input id={ids.to} value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} />
      </label>
      <label className="check">
        <input type="checkbox" checked={typeOnly} onChange={(e) => setTypeOnly(e.target.checked)} />
        <code>import type</code> (только типы)
      </label>

      <ol className="ladder" aria-label="Слои FSD">
        {layers.map((layer) => (
          <li
            key={layer}
            className={`ladder__step${fromMeta?.layer === layer ? ' ladder__step--from' : ''}${toMeta?.layer === layer ? ' ladder__step--to' : ''}`}
          >
            {layer}
            {fromMeta?.layer === layer && <em> ← откуда{fromMeta.slice ? ` (${fromMeta.slice})` : ''}</em>}
            {toMeta?.layer === layer && <em> ← куда{toMeta.slice ? ` (${toMeta.slice})` : ''}</em>}
          </li>
        ))}
      </ol>

      {!toMeta ? (
        <p className="verdict verdict--muted">Цель вне слоёв FSD (legacy-код) — этот чекер её не проверяет. В проекте такие связи перечислены в fsd-migration-edges.json.</p>
      ) : violations.length === 0 ? (
        <p className="verdict verdict--ok">✓ Импорт разрешён</p>
      ) : (
        <ul className="verdict verdict--fail">
          {violations.map((v) => (
            <li key={v.rule}>
              <code>{v.rule}</code> — {v.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
