/**
 * ApprovalWorkflow — единственный authority для статусных переходов (§5).
 *
 * Phase 9 additions:
 * - BatchContext: добавлен 'reject' action + 'rejected' status
 * - AdditionalWorkContext: новый контекст (submit / approve / reject)
 */

import { ForbiddenError } from '@/lib/versionCheck'

export type Role = 'engineer' | 'supervisor' | 'foreman' | 'sdo' | 'admin'

/** admin согласует наравне с supervisor (вкладка «Согласование», мигр.065). */
const canApprove = (role: Role): boolean => role === 'supervisor' || role === 'admin'

export type AnalysisStatus  = 'draft' | 'pending_approval' | 'approved'
export type BatchStatus      = 'draft' | 'pending_field_approval' | 'field_approved' | 'rejected'
export type AdditionalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected'

/** Доменный язык действий. */
export type WorkflowAction = 'submit' | 'approve' | 'reject' | 'direct_approve'

export interface AnalysisContext {
  entityType: 'execution_analysis'
  status:     AnalysisStatus
  createdBy:  string
  version:    number
  userRole:   Role
  userId:     string
  canEdit?: boolean
  hasContent: boolean
  /** Назначен ли текущий пользователь на текущий шаг согласования. admin игнорирует. */
  isAssignedCurrentStep?: boolean
}

export interface BatchContext {
  entityType:  'completion_batch'
  status:      BatchStatus
  submittedBy: string
  version:     number
  userRole:    Role
  userId:      string
  /** Может ли прораб редактировать анализ batch по project_assignments. */
  canEdit?:    boolean
  /** Назначен ли текущий пользователь на текущий шаг согласования. admin игнорирует. */
  isAssignedCurrentStep?: boolean
}

export interface AdditionalWorkContext {
  entityType: 'additional_work'
  status:     AdditionalStatus
  createdBy:  string
  version:    number
  userRole:   Role
  userId:     string
}

export type WorkflowContext = AnalysisContext | BatchContext | AdditionalWorkContext

export interface AllowedAction {
  action:          WorkflowAction
  requiredVersion: number
  disabledReason:  string | null
}

export class ApprovalWorkflow {
  assertCanTransition(ctx: WorkflowContext, action: WorkflowAction): void {
    const allowed = this.getAllowedActions(ctx)
    const found = allowed.find(a => a.action === action)
    if (!found) throw new ForbiddenError(`Действие '${action}' недоступно в текущем состоянии`)
    if (found.disabledReason) throw new ForbiddenError(found.disabledReason)
  }

  getAllowedActions(ctx: WorkflowContext): AllowedAction[] {
    if (ctx.entityType === 'execution_analysis') return this.analysisActions(ctx)
    if (ctx.entityType === 'completion_batch')   return this.batchActions(ctx)
    if (ctx.entityType === 'additional_work')    return this.additionalWorkActions(ctx)
    return []
  }

  private analysisActions(ctx: AnalysisContext): AllowedAction[] {
    const { status, userRole, version, hasContent } = ctx
    // Любой инженер может отправить любой черновик: инженеры имеют глобальный
    // доступ (§4), а submit_for_approval RPC тоже проверяет только role='engineer'.
    // Привязки к created_by нет намеренно — иначе анализ, созданный аккаунтом,
    // сменившим роль на supervisor, становится неотправляемым никем.
    if (status === 'draft' && (userRole === 'engineer' || (userRole === 'supervisor' && ctx.canEdit === true))) {
      return [{
        action:         'submit',
        requiredVersion: version,
        disabledReason: hasContent ? null : 'Добавьте хотя бы одну позицию',
      }]
    }
    if (status === 'pending_approval' && canApprove(userRole)) {
      if (userRole !== 'admin' && ctx.isAssignedCurrentStep !== true) return []
      return [
        { action: 'approve', requiredVersion: version, disabledReason: null },
        { action: 'reject',  requiredVersion: version, disabledReason: null },
      ]
    }
    return []
  }

  private batchActions(ctx: BatchContext): AllowedAction[] {
    const { status, userRole, version } = ctx
    if (status === 'pending_field_approval' && canApprove(userRole)) {
      if (userRole !== 'admin' && ctx.isAssignedCurrentStep !== true) return []
      return [
        { action: 'approve', requiredVersion: version, disabledReason: null },
        { action: 'reject',  requiredVersion: version, disabledReason: null },
      ]
    }
    // Draft/rejected — общий рабочий пакет: отправляет любой назначенный editor.
    if ((status === 'draft' || status === 'rejected') && (userRole === 'foreman' || userRole === 'engineer' || userRole === 'supervisor') && ctx.canEdit === true) {
      return [{ action: 'submit', requiredVersion: version, disabledReason: null }]
    }
    return []
  }

  private additionalWorkActions(ctx: AdditionalWorkContext): AllowedAction[] {
    const { status, userRole, userId, createdBy, version } = ctx
    // Автор (draft/rejected) может отправить
    if (
      (status === 'draft' || status === 'rejected') &&
      (userRole === 'foreman' || userRole === 'engineer') &&
      userId === createdBy
    ) {
      return [{ action: 'submit', requiredVersion: version, disabledReason: null }]
    }
    // Supervisor / admin согласует / отклоняет
    if (status === 'pending_approval' && canApprove(userRole)) {
      return [
        { action: 'approve', requiredVersion: version, disabledReason: null },
        { action: 'reject',  requiredVersion: version, disabledReason: null },
      ]
    }
    return []
  }
}

export const approvalWorkflow = new ApprovalWorkflow()
