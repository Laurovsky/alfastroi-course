import { useState } from 'react';

interface Row {
  unit_rate: number;
  version: number;
}

interface Pane {
  /** Снимок, который пользователь загрузил (то, что он видит на экране). */
  loaded: Row | null;
  draft: string;
  message: { kind: 'ok' | 'fail'; text: string } | null;
}

const emptyPane: Pane = { loaded: null, draft: '', message: null };
const users = ['Инженер 1', 'Инженер 2'] as const;

/**
 * Две вкладки редактируют одну строку analysis_rates. Переключатель version-check
 * показывает разницу между «тихой перезаписью» и 409 Conflict.
 */
export function VersionRace() {
  const [db, setDb] = useState<Row>({ unit_rate: 1000, version: 1 });
  const [panes, setPanes] = useState<[Pane, Pane]>([emptyPane, emptyPane]);
  const [locking, setLocking] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const update = (i: number, patch: Partial<Pane>) =>
    setPanes((p) => p.map((pane, j) => (j === i ? { ...pane, ...patch } : pane)) as [Pane, Pane]);

  const load = (i: number) => update(i, { loaded: { ...db }, draft: String(db.unit_rate), message: null });

  const save = (i: number) => {
    const pane = panes[i];
    if (!pane.loaded) return;
    const value = Number(pane.draft);
    if (!Number.isFinite(value) || value < 0) {
      update(i, { message: { kind: 'fail', text: '400: цена должна быть неотрицательным числом' } });
      return;
    }
    if (locking && db.version !== pane.loaded.version) {
      update(i, {
        message: { kind: 'fail', text: `409 Conflict: UPDATE … WHERE version = ${pane.loaded.version} затронул 0 строк (в базе уже version = ${db.version}). Перезагрузите данные.` },
      });
      setHistory((h) => [...h, `${users[i]}: попытка записать ${value} ₽ отклонена (409)`]);
      return;
    }
    const lost = !locking && db.version !== pane.loaded.version ? ` ⚠ правка ${db.unit_rate} ₽ потеряна молча` : '';
    const next = { unit_rate: value, version: db.version + 1 };
    setDb(next);
    update(i, { loaded: { ...next }, message: { kind: 'ok', text: `200 OK: сохранено, version = ${next.version}` } });
    setHistory((h) => [...h, `${users[i]}: записал(а) ${value} ₽${lost}`]);
  };

  return (
    <section className="widget">
      <header className="widget__head">
        <span className="widget__badge">Интерактив</span> Гонка двух пользователей
      </header>
      <p className="muted">
        Сценарий: оба нажимают «Открыть», первый меняет цену и сохраняет, затем второй меняет и сохраняет, не обновляя страницу.
      </p>
      <label className="check">
        <input type="checkbox" checked={locking} onChange={(e) => setLocking(e.target.checked)} />
        Optimistic locking (проверка version) включён
      </label>

      <div className="race-db">
        База: <code>analysis_rates</code> unit_rate = <strong>{db.unit_rate} ₽</strong>, version = <strong>{db.version}</strong>
      </div>

      <div className="race">
        {panes.map((pane, i) => (
          <div key={i} className="race__pane">
            <h4>{users[i]}</h4>
            <button type="button" className="btn" onClick={() => load(i)}>
              {pane.loaded ? 'Перезагрузить' : 'Открыть'}
            </button>
            {pane.loaded && (
              <>
                <p className="muted">
                  Видит: {pane.loaded.unit_rate} ₽ (version {pane.loaded.version})
                </p>
                <label className="field">
                  <span>Новая цена, ₽</span>
                  <input inputMode="decimal" value={pane.draft} onChange={(e) => update(i, { draft: e.target.value })} />
                </label>
                <button type="button" className="btn btn--primary" onClick={() => save(i)}>
                  Сохранить (prev_version = {pane.loaded.version})
                </button>
              </>
            )}
            {pane.message && <p className={`verdict verdict--${pane.message.kind}`}>{pane.message.text}</p>}
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <ol className="sim-log">
          {history.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          setDb({ unit_rate: 1000, version: 1 });
          setPanes([emptyPane, emptyPane]);
          setHistory([]);
        }}
      >
        Сбросить
      </button>
    </section>
  );
}
