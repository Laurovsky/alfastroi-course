import {assertCanUseConstructor} from '@/modules/access/constructorAccess'
import { runRpc } from '@/lib/rpcRunner'
import {
  countCompletionsForAnalysis,
  listAttachmentPathsForAnalysis,
  listAvailableExecutors,
} from '@/modules/analyses/queries'
import { removeFromStorage } from '@/modules/attachments/queries'
import { supabase } from '@/db/supabase'
import type { Analysis } from '@/modules/analyses/types'
import { approvalWorkflow, type AnalysisStatus, type Role } from '@/modules/approvals/workflow'
import { isAssignedToCurrentStep } from '@/modules/approvals/assignment'
import { ConflictError, ForbiddenError } from '@/lib/versionCheck'

export { listAvailableExecutors }
export { buildExecutionHistory } from './readModels/executionHistory'

/**
 * Engineer создаёт новый анализ в статусе draft. Расценки в analysis_rates
 * не копируются на этом шаге — они создаются при добавлении конкретного
 * work_item через RPC add_work_item_with_rate (см. §«analysis_rates»).
 */
export async function createAnalysis(input: {
  projectId: string
  packageId: string
  systemId: string | null
  rateSetId: string | null
  name: string
  userId: string
}): Promise<Analysis> {
  const rows = await runRpc<Analysis[]>('create_analysis_for_actor', {p_user_id: input.userId, p_payload: {
    project_id: input.projectId,
    package_id: input.packageId,
    system_id: input.systemId,
    rate_set_id: input.rateSetId,
    name: input.name,
  }})
  if (!rows[0]) throw new ConflictError('Не удалось создать анализ')
  return rows[0]
}

/**
 * Engineer-only переименование анализа с optimistic locking и audit внутри RPC.
 * Workflow-статус анализa не меняется.
 */
export async function renameAnalysis(input: {
  analysisId: string
  name: string
  prevVersion: number
  userId: string
}): Promise<Analysis> {
  return runRpc<Analysis>('rename_analysis', {
    p_analysis_id: input.analysisId,
    p_name: input.name,
    p_prev_version: input.prevVersion,
    p_user_id: input.userId,
  })
}

/**
 * Удаляет неиспользуемый анализ (engineer/admin). Гейт роли — в роуте.
 * Pre-check completions ДО трогания Storage: если анализ используется, бросаем
 * 409 и файлы не теряем. Затем чистим файлы Storage (best-effort, как deleteAct)
 * и зовём RPC delete_analysis (каскад + сироты approvals/attachments + audit).
 * RPC дублирует completions-guard (защита от гонки).
 */
export async function deleteAnalysis(input: {
  analysisId: string
  userId:     string
}): Promise<void> {
  const cnt = await countCompletionsForAnalysis(input.analysisId)
  if (cnt > 0) {
    throw new ConflictError('Анализ используется — есть выполнения, удаление невозможно')
  }

  const paths = await listAttachmentPathsForAnalysis(input.analysisId)
  if (paths.length > 0) {
    await removeFromStorage(paths)
  }

  await runRpc<void>('delete_analysis', {
    p_analysis_id: input.analysisId,
    p_user_id:     input.userId,
  })
}

/**
 * Engineer добавляет позицию из каталога в анализ через RPC add_work_item_with_rate.
 * RPC атомарно создаёт work_item + analysis_rate + audit_log.
 * Возвращает JSONB-результат RPC: { work_item, analysis_rate, batch_id, reused_rate }.
 */
export async function addWorkItemToAnalysis(input: {
  analysisId: string
  workCatalogId: string
  name: string
  unit: string | null
  coefficient: number
  qtyTotal: number
  executorType: string
  contractorId: string | null
  userId: string
}): Promise<unknown> {
  return runRpc('add_work_item_with_rate', {
    p_analysis_id: input.analysisId,
    p_work_catalog_id: input.workCatalogId,
    p_name: input.name,
    p_unit: input.unit ?? '',
    p_coefficient: input.coefficient,
    p_qty_total: input.qtyTotal,
    p_executor_type: input.executorType,
    p_contractor_id: input.contractorId,
    p_changed_by: input.userId,
  })
}

/**
 * Batch-insert section work_items (заголовки иерархии из ТКП).
 * Не использует RPC — секциям не нужна analysis_rate.
 * Пропускает уже существующие (по analysis_id + work_catalog_id).
 */
export async function addSectionWorkItemsBatch(
  analysisId: string,
  sections: Array<{ id: string; name: string; unit: string | null; code: string | null; type: string | null }>,
): Promise<void> {
  if (sections.length === 0) return

  // Проверяем какие уже есть — не дублируем
  const { data: existing } = await supabase
    .from('work_items')
    .select('work_catalog_id')
    .eq('analysis_id', analysisId)
    .in('work_catalog_id', sections.map((s) => s.id))

  const existingIds = new Set((existing ?? []).map((r) => r.work_catalog_id as string))
  const toInsert = sections.filter((s) => !existingIds.has(s.id))
  console.log(`[addSectionWorkItemsBatch] total=${sections.length}  existing=${existingIds.size}  toInsert=${toInsert.length}`)
  toInsert.forEach((s) => console.log(`  section: code=${s.code}  name=${s.name}`))
  if (toInsert.length === 0) return

  const { error } = await supabase.from('work_items').insert(
    toInsert.map((s) => ({
      analysis_id: analysisId,
      work_catalog_id: s.id,
      name: s.name,
      unit: s.unit,
      code_snapshot: s.code,
      type_snapshot: s.type ?? 'section',
      coefficient: 1,
      qty_total: 0,
    })),
  )
  if (error) throw new Error(`addSectionWorkItemsBatch: ${error.message}`)
}

/**
 * Engineer переводит анализ draft → pending_approval.
 * RPC сам проверяет роль (FORBIDDEN), текущий status и version (CONFLICT).
 */
async function fetchAnalysisRow(analysisId: string): Promise<{ status: AnalysisStatus; created_by: string; project_id: string }> {
  const { data, error } = await supabase
    .from('execution_analyses')
    .select('status, created_by, project_id')
    .eq('id', analysisId)
    .single()
  if (error || !data) throw new ForbiddenError('Анализ не найден')
  return data as { status: AnalysisStatus; created_by: string; project_id: string }
}

export async function submitForApproval(input: {
  analysisId: string
  prevVersion: number
  userId: string
  userRole: Role
  approverIds: string[]
}): Promise<Analysis> {
  const analysis = await fetchAnalysisRow(input.analysisId)
  await assertCanUseConstructor(input.userId, input.userRole, analysis.project_id)

  const { count } = await supabase
    .from('work_items')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_id', input.analysisId)
    .is('additional_status', null)
    .neq('type_snapshot', 'section')
    .gt('qty_total', 0)

  approvalWorkflow.assertCanTransition({
    entityType: 'execution_analysis',
    status:     analysis.status,
    createdBy:  analysis.created_by,
    version:    input.prevVersion,
    userRole:   input.userRole,
    userId:     input.userId,
    hasContent: (count ?? 0) > 0,
    canEdit: true,
  }, 'submit')

  return runRpc<Analysis>('submit_for_approval', {
    p_analysis_id:  input.analysisId,
    p_prev_version: input.prevVersion,
    p_user_id:      input.userId,
    p_approver_ids: input.approverIds,
  })
}

/**
 * Supervisor переводит анализ pending_approval → approved.
 * Дополнительно INSERTит approvals(step=1) для аудит-трека согласования.
 */
export async function approveAnalysis(input: {
  analysisId: string
  prevVersion: number
  userId: string
  userRole: Role
}): Promise<Analysis> {
  const analysis = await fetchAnalysisRow(input.analysisId)

  const isAssignedCurrentStep =
    input.userRole === 'admin'
      ? true
      : await isAssignedToCurrentStep('execution_analysis', input.analysisId, input.userId)

  approvalWorkflow.assertCanTransition({
    entityType: 'execution_analysis',
    status:     analysis.status,
    createdBy:  analysis.created_by,
    version:    input.prevVersion,
    userRole:   input.userRole,
    userId:     input.userId,
    hasContent: true,
    isAssignedCurrentStep,
  }, 'approve')

  return runRpc<Analysis>('approve_analysis', {
    p_analysis_id: input.analysisId,
    p_prev_version: input.prevVersion,
    p_user_id: input.userId,
  })
}

/**
 * Engineer отзывает анализ из pending_approval → draft (до approve supervisor'а).
 * Version check предотвращает race condition.
 */
export async function recallAnalysisSubmission(input: {
  analysisId:  string
  prevVersion: number
  userId:      string
}): Promise<Analysis> {
  return runRpc<Analysis>('recall_analysis_submission', {
    p_analysis_id:  input.analysisId,
    p_prev_version: input.prevVersion,
    p_user_id:      input.userId,
  })
}

/**
 * Supervisor возвращает анализ на доработку: pending_approval → draft.
 * Обязательный комментарий сохраняется в approvals(rejected, step=1).
 */
export async function rejectAnalysis(input: {
  analysisId:  string
  prevVersion: number
  userId:      string
  userRole:    Role
  comment:     string
}): Promise<Analysis> {
  const analysis = await fetchAnalysisRow(input.analysisId)

  const isAssignedCurrentStep =
    input.userRole === 'admin'
      ? true
      : await isAssignedToCurrentStep('execution_analysis', input.analysisId, input.userId)

  approvalWorkflow.assertCanTransition({
    entityType: 'execution_analysis',
    status:     analysis.status,
    createdBy:  analysis.created_by,
    version:    input.prevVersion,
    userRole:   input.userRole,
    userId:     input.userId,
    hasContent: true,
    isAssignedCurrentStep,
  }, 'reject')

  return runRpc<Analysis>('reject_analysis', {
    p_analysis_id:  input.analysisId,
    p_prev_version: input.prevVersion,
    p_user_id:      input.userId,
    p_comment:      input.comment,
  })
}
