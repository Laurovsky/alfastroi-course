import { useState } from 'react';
import { actors, allowedActions, apply, currentAssignee, initialState, type ActionName, type SimState } from '../lib/workflowSim';

const statusLabel: Record<SimState['status'], string> = {
  draft: 'Черновик',
  pending_approval: 'На согласовании',
  approved: 'Согласован',
};

const actionLabel: Record<ActionName, string> = { submit: 'Отправить на согласование', approve: 'Согласовать', reject: 'Отклонить' };

/**
 * Песочница машины состояний: переключайтесь между пользователями и смотрите,
 * какие кнопки им покажет GET /allowed-actions.
 */
export function WorkflowExplorer() {
  const [state, setState] = useState<SimState>(initialState);
  const [actorId, setActorId] = useState(actors[0].id);
  const [chain, setChain] = useState<string[]>(['supA']);
  const actor = actors.find((a) => a.id === actorId)!;
  const allowed = allowedActions(state, actor);
  const assignee = currentAssignee(state);

  const run = (action: ActionName) => setState((s) => apply(s, actor, action, chain));
  const toggleApprover = (id: string) =>
    setChain((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 2 ? [...c, id] : c));

  return (
    <section className="widget">
      <header className="widget__head">
        <span className="widget__badge">Интерактив</span> Машина состояний согласования
      </header>

      <div className="sim-status">
        {(['draft', 'pending_approval', 'approved'] as const).map((s) => (
          <span key={s} className={`sim-status__pill${state.status === s ? ' sim-status__pill--on' : ''}`}>
            {statusLabel[s]}
          </span>
        ))}
        <span className="sim-status__version">version = {state.version}</span>
      </div>

      {state.status === 'pending_approval' && (
        <p className="muted">
          Цепочка: {state.chain.map((id, i) => `${i + 1}. ${actors.find((a) => a.id === id)!.name}${i < state.approvedSteps ? ' ✓' : ''}`).join(' → ')}. Текущий шаг ждёт:{' '}
          <strong>{actors.find((a) => a.id === assignee)?.name}</strong>
        </p>
      )}

      <div className="sim-actors" role="radiogroup" aria-label="Кто вы">
        {actors.map((a) => (
          <label key={a.id} className={`chip${a.id === actorId ? ' chip--on' : ''}`}>
            <input type="radio" name="sim-actor" checked={a.id === actorId} onChange={() => setActorId(a.id)} />
            {a.name} <small>({a.role})</small>
          </label>
        ))}
      </div>

      {state.status === 'draft' && actor.role === 'engineer' && (
        <div className="sim-chain">
          <span>Согласующие (1–2, по порядку):</span>
          {actors
            .filter((a) => a.role === 'supervisor')
            .map((a) => (
              <label key={a.id} className="check">
                <input type="checkbox" checked={chain.includes(a.id)} onChange={() => toggleApprover(a.id)} />
                {a.name} {chain.includes(a.id) && <small>(шаг {chain.indexOf(a.id) + 1})</small>}
              </label>
            ))}
          <label className="check">
            <input type="checkbox" checked={state.hasContent} onChange={(e) => setState((s) => ({ ...s, hasContent: e.target.checked }))} />В анализе есть позиции
          </label>
        </div>
      )}

      <div className="sim-buttons">
        {allowed.length === 0 && <p className="muted">Для этого пользователя действий нет — кнопки скрыты.</p>}
        {allowed.map((a) => (
          <button
            key={a.action}
            type="button"
            className={`btn${a.action === 'reject' ? '' : ' btn--primary'}`}
            disabled={Boolean(a.disabledReason) || (a.action === 'submit' && chain.length === 0)}
            title={a.disabledReason ?? undefined}
            onClick={() => run(a.action)}
          >
            {actionLabel[a.action]}
          </button>
        ))}
        {allowed.some((a) => a.disabledReason) && <p className="muted">{allowed.find((a) => a.disabledReason)?.disabledReason}</p>}
      </div>

      {state.log.length > 0 && (
        <ol className="sim-log">
          {state.log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      )}
      <button type="button" className="btn btn--ghost" onClick={() => setState(initialState)}>
        Начать заново
      </button>
    </section>
  );
}
