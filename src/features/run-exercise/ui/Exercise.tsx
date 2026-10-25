import { useState } from 'react';
import { getExercise } from '@/entities/exercise';
import { useProgressStore } from '@/entities/progress';
import type { SuiteResult } from '@/shared/lib/mini-test';
import { Code, CodeEditor } from '@/shared/ui/code';
import { runInWorker } from '../lib/runInWorker';

/**
 * Интерактивное упражнение: условие → редактор → тесты (красный/зелёный).
 * Черновик кода сохраняется в прогрессе, поэтому переживает перезагрузку.
 */
export function Exercise({ id }: { id: string }) {
  const exercise = getExercise(id);
  const draft = useProgressStore((s) => s.drafts[id]);
  const passed = useProgressStore((s) => s.passedExercises.includes(id));
  const saveDraft = useProgressStore((s) => s.saveDraft);
  const markPassed = useProgressStore((s) => s.markExercisePassed);
  const [result, setResult] = useState<SuiteResult | null>(null);
  const [running, setRunning] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  if (!exercise) return <div className="callout callout--danger">Упражнение «{id}» не найдено</div>;
  const code = draft ?? exercise.starter;

  const run = async () => {
    setRunning(true);
    const r = await runInWorker(exercise.id, code);
    setResult(r);
    setRunning(false);
    if (r.passed) markPassed(exercise.id);
  };

  const greenCount = result?.results.filter((r) => r.passed).length ?? 0;

  return (
    <section className={`exercise${passed ? ' exercise--passed' : ''}`} aria-labelledby={`ex-${id}`}>
      <header className="exercise__head">
        <span className="exercise__badge">Упражнение</span>
        <h3 id={`ex-${id}`} className="exercise__title">
          {exercise.title}
        </h3>
        {passed && <span className="exercise__done">✓ решено</span>}
      </header>
      <div className="exercise__task">
        {exercise.task.split('\n\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <CodeEditor value={code} onChange={(v) => saveDraft(exercise.id, v)} label={`Код упражнения ${exercise.title}`} />

      <div className="exercise__actions">
        <button type="button" className="btn btn--primary" onClick={run} disabled={running}>
          {running ? 'Запуск…' : '▶ Запустить тесты'}
        </button>
        {hintsShown < exercise.hints.length && (
          <button type="button" className="btn" onClick={() => setHintsShown((n) => n + 1)}>
            Подсказка ({hintsShown}/{exercise.hints.length})
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            if (window.confirm('Вернуть исходную заготовку? Ваш код будет потерян.')) {
              saveDraft(exercise.id, exercise.starter);
              setResult(null);
            }
          }}
        >
          Сбросить
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setShowSolution((v) => !v)}>
          {showSolution ? 'Скрыть решение' : 'Показать решение'}
        </button>
      </div>

      {hintsShown > 0 && (
        <ol className="exercise__hints">
          {exercise.hints.slice(0, hintsShown).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}

      {result && (
        <div className="tests" role="status" aria-live="polite">
          {result.compileError ? (
            <>
              <p className="tests__compile">⛔ {result.compileError}</p>
              {result.diagnostics.length > 0 && <pre className="tests__diagnostics">{result.diagnostics.join('\n')}</pre>}
            </>
          ) : (
            <>
              <p className={`tests__summary ${result.passed ? 'tests__summary--ok' : 'tests__summary--fail'}`}>
                {result.passed ? '🟢 Green: все тесты прошли' : `🔴 Red: ${greenCount} из ${result.results.length} тестов зелёные`}
              </p>
              <ul className="tests__list">
                {result.results.map((r) => (
                  <li key={r.name} className={r.passed ? 'tests__item tests__item--ok' : 'tests__item tests__item--fail'}>
                    <span aria-hidden>{r.passed ? '✓' : '✗'}</span> {r.name}
                    {r.error && <div className="tests__error">{r.error}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {showSolution && (
        <details open className="exercise__solution">
          <summary>Эталонное решение</summary>
          <Code code={exercise.solution} lang="javascript" />
        </details>
      )}
    </section>
  );
}
