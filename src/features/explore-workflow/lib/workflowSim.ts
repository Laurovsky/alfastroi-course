/**
 * Учебная модель согласования анализа: правила ApprovalWorkflow.analysisActions
 * + адресная цепочка из 1–2 руководителей (миграция 066). В проекте те же
 * переходы делают RPC submit_for_approval / approve_approval_step / reject_approval_step.
 */
export type Status = 'draft' | 'pending_approval' | 'approved';
export type Role = 'engineer' | 'supervisor' | 'foreman' | 'admin';
export type ActionName = 'submit' | 'approve' | 'reject';

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export const actors: Actor[] = [
  { id: 'eng', name: 'Инженер Орлова', role: 'engineer' },
  { id: 'supA', name: 'Руководитель Ким', role: 'supervisor' },
  { id: 'supB', name: 'Руководитель Лебедев', role: 'supervisor' },
  { id: 'admin', name: 'Администратор', role: 'admin' },
  { id: 'fore', name: 'Прораб Саидов', role: 'foreman' },
];

export interface SimState {
  status: Status;
  version: number;
  hasContent: boolean;
  /** Назначенные руководители по шагам (step = индекс + 1). */
  chain: string[];
  /** Сколько шагов уже закрыто. Текущий шаг = approvedSteps (MIN(step) среди pending). */
  approvedSteps: number;
  log: string[];
}

export interface AllowedAction {
  action: ActionName;
  disabledReason: string | null;
}

export const initialState: SimState = { status: 'draft', version: 1, hasContent: true, chain: [], approvedSteps: 0, log: [] };

export function currentAssignee(state: SimState): string | null {
  if (state.status !== 'pending_approval') return null;
  return state.chain[state.approvedSteps] ?? null;
}

export function allowedActions(state: SimState, actor: Actor): AllowedAction[] {
  const canApprove = actor.role === 'supervisor' || actor.role === 'admin';
  if (state.status === 'draft' && actor.role === 'engineer')
    return [{ action: 'submit', disabledReason: state.hasContent ? null : 'Добавьте хотя бы одну позицию' }];
  if (state.status === 'pending_approval' && canApprove) {
    const assigned = currentAssignee(state) === actor.id;
    if (actor.role !== 'admin' && !assigned) return [];
    return [
      { action: 'approve', disabledReason: null },
      { action: 'reject', disabledReason: null },
    ];
  }
  return [];
}

export class ForbiddenError extends Error {}

/**
 * Применяет действие. Как и на сервере, сначала проверяет право (assertCanTransition),
 * и только потом меняет состояние; version растёт на каждом переходе.
 */
export function apply(state: SimState, actor: Actor, action: ActionName, approvers: string[] = []): SimState {
  const found = allowedActions(state, actor).find((a) => a.action === action);
  if (!found) throw new ForbiddenError(`Действие '${action}' недоступно в текущем состоянии`);
  if (found.disabledReason) throw new ForbiddenError(found.disabledReason);
  const version = state.version + 1;
  const step = state.approvedSteps + 1;

  if (action === 'submit') {
    if (approvers.length < 1 || approvers.length > 2) throw new ForbiddenError('Выберите 1–2 руководителей');
    return { ...state, status: 'pending_approval', version, chain: approvers, approvedSteps: 0, log: [...state.log, `${actor.name}: отправил(а) на согласование`] };
  }
  if (action === 'approve') {
    const approvedSteps = state.approvedSteps + 1;
    const final = approvedSteps >= state.chain.length;
    return {
      ...state,
      version,
      approvedSteps,
      status: final ? 'approved' : 'pending_approval',
      log: [...state.log, `${actor.name}: согласовал(а) шаг ${step}${final ? ' — финальный, анализ согласован' : ''}`],
    };
  }
  return {
    ...state,
    version,
    status: 'draft',
    chain: [],
    approvedSteps: 0,
    log: [...state.log, `${actor.name}: отклонил(а) на шаге ${step} — к автору, остальные шаги удалены`],
  };
}
