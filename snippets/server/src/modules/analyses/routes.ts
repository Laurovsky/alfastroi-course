import monthlyAnalysisRoutes from './monthlyAnalysisRoutes'
import {getAssignment} from '@/modules/access/queries'
import {createCatalogItemBodySchema} from '@/modules/catalog/validators'
import {createImportCatalogItem} from '@/modules/analyses/useCases/createImportCatalogItem'
import {analysisEditorRequest, hasAnalysisReviewResponse} from '@/modules/analyses/constructor/reviewMutation'
import { Router, Request, Response, NextFunction } from 'express'

/** Multer передаёт originalname как latin-1; перекодируем в UTF-8. */
const decodeFilename = (name: string) => Buffer.from(name, 'latin1').toString('utf8')
import { authMiddleware, requireRole } from '@/middleware/auth'
import { requireIdempotency } from '@/middleware/idempotency'
import { uploadRateLimit } from '@/middleware/rateLimit'
import { uploadTkp } from '@/middleware/upload'
import { parseOr400 } from '@/lib/zodHttp'
import { approvalWorkflow, type Role } from '@/modules/approvals/workflow'
import { isAssignedToCurrentStep } from '@/modules/approvals/assignment'
import { buildApprovalView } from '@/modules/analyses/readModels/approvalView'
import { listAnalysesForApproval } from '@/modules/analyses/readModels/pendingAnalysisQueue'
import { resolveAccessibleAnalysisIds, assertCanReadAnalysis, assertCanReadWorkItem } from '@/modules/access/service'
import { resolveUserNames } from '@/lib/resolveUserNames'
import { supabase } from '@/db/supabase'
import {
  deleteWorkItem,
  deleteWorkItemsBatch,
  getAnalysisById,
  getAnalysisListItemById,
  getAnalysisHistory,
  getAnalysisRateSetInfo,
  getCatalogItemSnapshot,
  getCatalogItemSnapshotsBatch,
  getCatalogItemsForMatching,
  listAllAnalyses,
  listAnalysesByProject,
  listWorkItemsForAnalysis,
  updateAnalysisSystemId,
  getWorkItemsForDiff,
  getCompletionTotalsByWorkItems,
  listExecutionSources,
} from '@/modules/analyses/queries'
import {
  addSectionWorkItemsBatch,
  buildExecutionHistory,
  addWorkItemToAnalysis,
  approveAnalysis,
  createAnalysis,
  deleteAnalysis,
  listAvailableExecutors,
  recallAnalysisSubmission,
  rejectAnalysis,
  renameAnalysis,
  submitForApproval,
} from '@/modules/analyses/service'
import { addWorkItemsBatch } from '@/modules/analyses/addWorkItemsBatch'
import {
  addWorkItemBodySchema,
  addWorkItemsBatchBodySchema,
  analysisIdParamsSchema,
  applyDiffBodySchema,
  createAnalysisBodySchema,
  deleteWorkItemsBatchBodySchema,
  executionViewQuerySchema,
  executionHistoryQuerySchema,
  importTkpConfirmBodySchema,
  projectIdQuerySchema,
  provisionCatalogBodySchema,
  rejectAnalysisBodySchema,
  submitForApprovalBodySchema,
  updateAnalysisSystemBodySchema,
  updateAnalysisNameBodySchema,
  updateWorkItemQtySchema,
  updateWorkItemNoteSchema,
  versionedBodySchema,
  workItemParamsSchema,
} from '@/modules/analyses/validators'
import { buildExecutionView } from '@/modules/analyses/readModels/executionView'
import { analysisCatalogNodesHandler } from '@/modules/analyses/catalogNodesHandler'
import { runRpc } from '@/lib/rpcRunner'
import { TkpParseError } from '@/modules/analyses/constructor/parsers/TkpParseError'
import { parseEstimate } from '@/modules/analyses/constructor/parsers/parseEstimate'
import type { RawRow } from '@/modules/analyses/constructor/types'
import type { ApplyTkpDiffResponse } from '@alfastroi/types'
import { isSminexEstimateContext } from '@/modules/analyses/constructor/parserContext'
import { provisionSminexCatalog } from '@/modules/analyses/useCases/provisionSminexCatalog'
import { matchRowsToCatalog } from '@/modules/analyses/constructor/matchToCatalog'
import { computeTkpDiff } from '@/modules/analyses/constructor/diffTkp'
import { deriveRowType } from '@/modules/analyses/constructor/deriveRowType'
import { getWorkItemMaterials } from '@/modules/materials/queries'
import { countMaterialsWithoutCoefficient } from '@/modules/analyses/constructor/countMaterialsWithoutCoefficient'
import { toLastRejectionDto, type LastRejectionRow } from '@/modules/analyses/lastRejection'
import { confirmTkpImport } from '@/modules/analyses/confirmTkpImport'
import { applyTkpDiff } from '@/modules/analyses/applyTkpDiff'
import { updateWorkItemQty } from '@/modules/analyses/updateWorkItemQty'

import {getAnalysisEditorAccess} from '@/modules/analyses/constructor/editorAccess'
import {listConstructorProjectIds} from '@/modules/access/constructorAccess'
import {listAnalysisIdsForProjects} from '@/modules/access/queries'

const router = Router()
router.use(monthlyAnalysisRoutes)
router.use(analysisEditorRequest)
router.get('/analyses/:id/constructor-capabilities', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const params = parseOr400(analysisIdParamsSchema, req.params, res)
  if (!params) return
  try { res.json(await getAnalysisEditorAccess(params.id, req.user!.id)) } catch (error) { next(error) }
})

/** GET /api/analyses?project_id=... — список анализов проекта (или всех). */
router.get('/analyses', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = parseOr400(projectIdQuerySchema, req.query, res)
  if (!parsed) return

  try {
    if (req.user!.role === 'foreman') {
      res.status(403).json({ error: 'Нет доступа к списку анализов' })
      return
    }
    const projectIds = parsed.context === 'constructor' ? await listConstructorProjectIds(req.user!.id, req.user!.role) : null
    const accessibleIds = projectIds === null ? await resolveAccessibleAnalysisIds(req.user!.id, req.user!.role) : await listAnalysisIdsForProjects(projectIds)
    if (parsed.project_id) {
      const data = await listAnalysesByProject(parsed.project_id)
      res.json(accessibleIds === null ? data : data.filter((a) => accessibleIds.includes(a.id)))
    } else {
      const data = await listAllAnalyses()
      res.json(accessibleIds === null ? data : data.filter((a) => accessibleIds.includes(a.id)))
    }
  } catch (e) {
    next(e)
  }
})

/**
 * GET /api/analyses/pending-approval?status=pending_approval|approved
 * Очередь анализов для supervisor'а — «На согласовании» / «Согласованные».
 * Регистрируется ДО /analyses/:id (§10 CLAUDE.md — static before param).
 */
router.get(
  '/analyses/pending-approval',
  authMiddleware,
  requireRole('supervisor', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    const statusParam = req.query.status as string | undefined
    const status: 'pending_approval' | 'approved' =
      statusParam === 'approved' ? 'approved' : 'pending_approval'
    try {
      const data = await listAnalysesForApproval(status, req.user!.id, req.user!.role)
      res.json({ analyses: data })
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses — engineer создаёт черновик анализа.
 * Body: { project_id, package_id, system_id?, name }.
 * Возвращает созданную запись со status='draft', version=1.
 */
router.post(
  '/analyses',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  requireIdempotency('/api/analyses'),
  async (req: Request, res: Response, next: NextFunction) => {
    const body = parseOr400(createAnalysisBodySchema, req.body, res)
    if (!body) return

    try {
      const created = await createAnalysis({
        projectId: body.project_id,
        packageId: body.package_id,
        systemId: body.system_id ?? null,
        rateSetId: body.rate_set_id ?? null,
        name: body.name,
        userId: req.user!.id,
      })
      res.status(201).json(created)
    } catch (e) {
      next(e)
    }
  },
)

/** PATCH /api/analyses/:id/name — engineer переименовывает анализ в любом статусе. */
router.patch(
  '/analyses/:id/name',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(updateAnalysisNameBodySchema, req.body, res)
    if (!body) return

    try {
      const updated = await renameAnalysis({
        analysisId: params.id,
        name: body.name,
        prevVersion: body.prev_version,
        userId: req.user!.id,
      })
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * DELETE /api/analyses/:id — engineer/admin удаляет неиспользуемый анализ.
 * 409 если у анализа есть хотя бы одна строка completions (любого статуса).
 * Каскад work_items/analysis_rates/completion_batches/additional_acts + очистка
 * сирот approvals/attachments + Storage. Идемпотентен (нет анализа → 204).
 */
router.delete(
  '/analyses/:id',
  authMiddleware,
  requireRole('engineer', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    try {
      await deleteAnalysis({ analysisId: params.id, userId: req.user!.id })
      res.status(204).end()
    } catch (e) {
      next(e)
    }
  },
)

/**
 * GET /api/analyses/:id/work-items — список work_items анализа со
 * связанной расценкой (matched по executor_type/contractor_id из rate_set
 * анализа). Read-only DTO для конструктора и согласования.
 */
router.get(
  '/analyses/:id/work-items',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!parsed) return

    try {
      const data = await listWorkItemsForAnalysis(parsed.id)
      res.json(data)
    } catch (e) {
      next(e)
    }
  },
)

/** GET /api/analyses/:id/catalog-nodes — подграф каталога для разделов конструктора. */
router.get('/analyses/:id/catalog-nodes', authMiddleware, analysisCatalogNodesHandler)

/**
 * POST /api/analyses/:id/work-items — engineer добавляет позицию из каталога.
 * Body: { work_catalog_id, qty_total, coefficient? }.
 * Вызывает RPC add_work_item_with_rate: атомарно INSERT work_item + analysis_rate + audit_log.
 * 404 если позиция каталога не найдена.
 * 422 если у анализа не привязан rate_set (не знаем executor_type для матчинга расценки).
 * 403/409 проброшены из RPC (роль, status, version).
 */
router.post(
  '/analyses/:id/work-items',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  requireIdempotency('/api/analyses/:id/work-items'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(addWorkItemBodySchema, req.body, res)
    if (!body) return

    try {
      const [catalogItem, rateSetInfo] = await Promise.all([
        getCatalogItemSnapshot(body.work_catalog_id),
        getAnalysisRateSetInfo(params.id),
      ])

      if (!catalogItem) {
        res.status(404).json({ error: 'Позиция каталога не найдена' })
        return
      }
      if (!rateSetInfo) {
        res.status(422).json({
          error:
            'У анализа не привязан набор расценок. Привяжите набор расценок, чтобы добавлять работы.',
        })
        return
      }

      const result = await addWorkItemToAnalysis({
        analysisId: params.id,
        workCatalogId: body.work_catalog_id,
        name: catalogItem.name,
        unit: catalogItem.unit,
        coefficient: body.coefficient,
        qtyTotal: body.qty_total,
        executorType: rateSetInfo.executorType,
        contractorId: rateSetInfo.contractorId,
        userId: req.user!.id,
      })

      res.status(201).json(result)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/work-items/batch — батч-добавление работ из каталога.
 * Body: { items: [{ work_catalog_id, qty_total, coefficient? }, ...] }.
 * Сравнительно с N последовательными POST: один HTTP roundtrip, один batched
 * SELECT для catalog snapshots, один SELECT для rate_set. RPC внутри вызываются
 * последовательно — это нормально, БД локальная.
 * 422 если у анализа не привязан rate_set. 404 если какой-то catalog id не найден.
 */
router.post(
  '/analyses/:id/work-items/batch',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  requireIdempotency('/api/analyses/:id/work-items/batch'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(addWorkItemsBatchBodySchema, req.body, res)
    if (!body) return

    try {
      const ids = Array.from(new Set(body.items.map((i) => i.work_catalog_id)))
      const [catalogMap, rateSetInfo] = await Promise.all([
        getCatalogItemSnapshotsBatch(ids),
        getAnalysisRateSetInfo(params.id),
      ])

      if (!rateSetInfo) {
        res.status(422).json({
          error:
            'У анализа не привязан набор расценок. Привяжите набор расценок, чтобы добавлять работы.',
        })
        return
      }

      const missing = ids.filter((id) => !catalogMap.has(id))
      if (missing.length > 0) {
        res.status(404).json({
          error: `Позиции каталога не найдены: ${missing.join(', ')}`,
        })
        return
      }

      const enriched = body.items.map((it) => ({
        workCatalogId: it.work_catalog_id,
        qtyTotal: it.qty_total,
        coefficient: it.coefficient,
      }))

      const result = await addWorkItemsBatch({
        analysisId: params.id,
        executorType: rateSetInfo.executorType,
        contractorId: rateSetInfo.contractorId,
        userId: req.user!.id,
        items: enriched,
      })

      res.status(201).json(result)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * PATCH /api/analyses/:id/work-items/:workItemId — inline-правка qty_total.
 * Body: { prev_version, qty_total }.
 * Conditional UPDATE (§2 optimistic locking). 409 при version mismatch.
 * Триггер return_analysis_to_pending сам откатывает анализ при mid-flight правке.
 */
router.patch(
  '/analyses/:id/work-items/:workItemId',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(workItemParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(updateWorkItemQtySchema, req.body, res)
    if (!body) return

    try {
      const updated = await updateWorkItemQty({
        workItemId: params.workItemId,
        prevVersion: body.prev_version,
        qtyTotal: body.qty_total,
        userId: req.user!.id,
      })
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * PATCH /api/analyses/:id/work-items/:workItemId/note — правка примечания.
 * Body: { prev_version, note }. RPC set_work_item_note: UPDATE note + гарантия
 * baseline-расценки нового (код,note) (мигр.077). 409 при version mismatch.
 */
router.patch(
  '/analyses/:id/work-items/:workItemId/note',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(workItemParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(updateWorkItemNoteSchema, req.body, res)
    if (!body) return
    try {
      const result = await runRpc('set_work_item_note', {
        p_work_item_id: params.workItemId,
        p_note: body.note,
        p_prev_version: body.prev_version,
        p_changed_by: req.user!.id,
      })
      res.json(result)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * DELETE /api/analyses/:id/work-items — batch-удаление.
 * Body: { ids: string[] }. Позиции с completions пропускаются, возвращаются в blocked[].
 */
router.delete(
  '/analyses/:id/work-items',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(deleteWorkItemsBatchBodySchema, req.body, res)
    if (!body) return
    try {
      const t0 = Date.now()
      console.log(`[DELETE batch] ids=${body.ids.length}`)
      const result = await deleteWorkItemsBatch(params.id, body.ids, req.user!.id, req.body.versions)
      console.log(`[DELETE batch] done ${Date.now() - t0}ms  deleted=${result.deleted} blocked=${result.blocked.length}`)
      res.json(result)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * DELETE /api/analyses/:id/work-items/:workItemId — удаляет позицию.
 * 409 если по позиции есть completions (soft-delete через removed_from_tkp вместо этого).
 */
router.delete(
  '/analyses/:id/work-items/:workItemId',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(workItemParamsSchema, req.params, res)
    if (!params) return
    try {
      const t0 = Date.now()
      console.log(`[DELETE single] workItemId=${params.workItemId}`)
      await deleteWorkItem(params.id, params.workItemId, req.user!.id, req.body?.versions)
      console.log(`[DELETE single] done ${Date.now() - t0}ms`)
      if (hasAnalysisReviewResponse()) res.json(null)
      else res.status(204).end()
    } catch (e) {
      next(e)
    }
  },
)

/**
 * GET /api/analyses/:id/execution-view?period=YYYY-MM
 * DTO для рабочего экрана выполнения (прораб / инженер / supervisor).
 * Возвращает work_items + completions за период + all-time totals.
 * period по умолчанию = текущий месяц сервера.
 */
router.get(
  '/analyses/:id/execution-view',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const query = parseOr400(executionViewQuerySchema, req.query, res)
    if (!query) return

    const period = query.period ?? new Date().toISOString().substring(0, 7)

    try {
      await assertCanReadAnalysis(req.user!.id, req.user!.role, params.id)
      const dto = await buildExecutionView({
        analysisId: params.id,
        period,
        userId: req.user?.id,
        userRole: req.user?.role,
        batchId: query.batch_id,
      })
      res.json(dto)
    } catch (e) {
      next(e)
    }
  },
)

router.get('/analyses/:id/execution-history', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const params = parseOr400(analysisIdParamsSchema, req.params, res)
  if (!params) return
  const query = parseOr400(executionHistoryQuerySchema, req.query, res)
  if (!query) return
  try {
    res.json(await buildExecutionHistory({ analysisId: params.id, period: query.period, executionBatchId: query.execution_batch_id,
      userId: req.user!.id, userRole: req.user!.role, limit: query.limit, cursor: query.cursor }))
  } catch (error) { next(error) }
})

/** GET /api/analyses/:id — один анализ. */
router.get('/analyses/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = parseOr400(analysisIdParamsSchema, req.params, res)
  if (!parsed) return

  try {
    await assertCanReadAnalysis(req.user!.id, req.user!.role, parsed.id)
    const data = await getAnalysisById(parsed.id)
    if (!data) {
      res.status(404).json({ error: 'Анализ не найден' })
      return
    }
    res.json(data)
  } catch (e) {
    next(e)
  }
})

/**
 * GET /api/analyses/:id/last-rejection — последний rejection-комментарий supervisor'а.
 * Используется AnalysisConstructorPage для показа баннера инженеру.
 * 200: { comment, created_at, supervisor_name } | 404: нет записей.
 */
router.get(
  '/analyses/:id/last-rejection',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!parsed) return
    try {
      await assertCanReadAnalysis(req.user!.id, req.user!.role, parsed.id)
      // Access check: supervisor sees any analysis, engineer sees only their own
      const analysis = await getAnalysisById(parsed.id)
      if (!analysis) {
        res.status(404).json({ error: 'Анализ не найден' })
        return
      }
      const userRole = req.user!.role
      const userId = req.user!.id
      // Конструктор дёргает этот эндпоинт на каждом открытии черновика. Доступ к
      // анализу есть у engineer (глобально, §4), supervisor и admin; прочие роли —
      // только к своим. Раньше жёсткий created_by-гард спамил 403 в консоль на
      // чужих черновиках (engineer открывал анализ, созданный другим аккаунтом).
      const canView =
        userRole === 'engineer' ||
        userRole === 'supervisor' ||
        userRole === 'admin' ||
        analysis.created_by === userId
      if (!canView) {
        res.status(403).json({ error: 'Нет доступа к этому анализу' })
        return
      }

      const { data, error } = await supabase
        .from('approvals')
        .select('approved_by, comment, created_at')
        .eq('entity_type', 'execution_analysis')
        .eq('entity_id', parsed.id)
        .eq('status', 'rejected')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw new Error(`last-rejection: ${error.message}`)
      if (!data) {
        res.json(toLastRejectionDto(null, null))
        return
      }

      // Имя supervisor'а из profiles
      const row = data as LastRejectionRow
      const nameMap = await resolveUserNames([row.approved_by])
      res.json(toLastRejectionDto(row, nameMap.get(row.approved_by) ?? null))
    } catch (e) {
      next(e)
    }
  },
)

/**
 * GET /api/analyses/:id/approval-view — diff work_items относительно последнего approve/reject.
 * Используется supervisor'ом при согласовании анализа.
 * Возвращает ApprovalViewDTO: items с diffStatus (new/removed/changed/unchanged) + rateChanged.
 */
router.get(
  '/analyses/:id/approval-view',
  authMiddleware,
  requireRole('supervisor', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!parsed) return
    try {
      await assertCanReadAnalysis(req.user!.id, req.user!.role, parsed.id)
      const data = await buildApprovalView({ analysisId: parsed.id })
      res.json(data)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * GET /api/analyses/:id/allowed-actions — что текущий пользователь может
 * сделать с этим анализом. Frontend рендерит кнопки по этому списку
 * (см. §5 CLAUDE.md + `ApprovalWorkflow`).
 *
 * Response: { actions: AllowedAction[] }
 *   actions: [] — действий нет (роль не подходит, статус терминальный).
 *   action.disabledReason — действие разрешено по роли, но бизнес-условие
 *     не выполнено (например, в анализе нет позиций для submit).
 *   action.requiredVersion — клиент передаёт в prev_version при submit/approve.
 */
router.get('/analyses/:id/allowed-actions', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = parseOr400(analysisIdParamsSchema, req.params, res)
  if (!parsed) return

  try {
    await assertCanReadAnalysis(req.user!.id, req.user!.role, parsed.id)
    const analysis = await getAnalysisById(parsed.id)
    if (!analysis) {
      res.status(404).json({ error: 'Анализ не найден' })
      return
    }

    // hasContent: ≥1 trackable work_item с qty_total > 0.
    // Исключаем section-строки и доп. работы — submit требует «реальных» позиций
    // основного договора. Считаем через HEAD count чтобы не тянуть строки.
    const { count, error: cntErr } = await supabase
      .from('work_items')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_id', parsed.id)
      .is('additional_status', null)
      .neq('type_snapshot', 'section')
      .gt('qty_total', 0)
    if (cntErr) throw new Error(`hasContent count: ${cntErr.message}`)

    const isAssignedCurrentStep =
      (req.user!.role === 'admin')
        ? true
        : await isAssignedToCurrentStep('execution_analysis', parsed.id, req.user!.id)

    const actions = approvalWorkflow.getAllowedActions({
      entityType:           'execution_analysis',
      status:               analysis.status,
      createdBy:            analysis.created_by,
      version:              analysis.version,
      userRole:             req.user!.role as Role,
      userId:               req.user!.id,
      hasContent:           (count ?? 0) > 0,
      canEdit: req.user!.role !== 'supervisor' || Boolean(await getAssignment(req.user!.id, analysis.project_id)),
      isAssignedCurrentStep,
    })
    res.json({ actions })
  } catch (e) {
    next(e)
  }
})

/**
 * POST /api/analyses/:id/submit-for-approval — engineer отправляет на согласование.
 * Body: { prev_version, approver_ids }. 403 если не engineer, 409 если status≠draft или version устарел.
 */
router.post(
  '/analyses/:id/submit-for-approval',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  requireIdempotency('/api/analyses/:id/submit-for-approval'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(submitForApprovalBodySchema, req.body, res)
    if (!body) return

    try {
      const updated = await submitForApproval({
        analysisId:  params.id,
        prevVersion: body.prev_version,
        userId:      req.user!.id,
        userRole:    req.user!.role as Role,
        approverIds: body.approver_ids,
      })
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/recall — engineer отзывает анализ из pending_approval → draft.
 * Body: { prev_version }. 403 если не engineer или чужой анализ.
 * 409 если status≠pending_approval, version mismatch, или уже есть approval-запись.
 * Idempotency-Key защищает от двойного recall на плохой сети (§9).
 */
router.post(
  '/analyses/:id/recall',
  authMiddleware,
  requireRole('engineer'),
  requireIdempotency('/api/analyses/:id/recall'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(versionedBodySchema, req.body, res)
    if (!body) return

    try {
      const updated = await recallAnalysisSubmission({
        analysisId:  params.id,
        prevVersion: body.prev_version,
        userId:      req.user!.id,
      })
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/approve — supervisor согласует анализ.
 * Body: { prev_version }. 403 если не supervisor, 409 если status≠pending_approval.
 */
router.post(
  '/analyses/:id/approve',
  authMiddleware,
  requireRole('supervisor', 'admin'),
  requireIdempotency('/api/analyses/:id/approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(versionedBodySchema, req.body, res)
    if (!body) return

    try {
      const updated = await approveAnalysis({
        analysisId:  params.id,
        prevVersion: body.prev_version,
        userId:      req.user!.id,
        userRole:    req.user!.role as Role,
      })
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/reject — supervisor возвращает анализ на доработку.
 * Body: { prev_version, comment }.
 * 403 если не supervisor. 409 если version mismatch или status≠pending_approval.
 * Idempotency-Key защищает от двойного reject на плохой сети (§9 CLAUDE.md).
 */
router.post(
  '/analyses/:id/reject',
  authMiddleware,
  requireRole('supervisor', 'admin'),
  requireIdempotency('/api/analyses/:id/reject'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(rejectAnalysisBodySchema, req.body, res)
    if (!body) return

    try {
      const updated = await rejectAnalysis({
        analysisId:  params.id,
        prevVersion: body.prev_version,
        userId:      req.user!.id,
        userRole:    req.user!.role as Role,
        comment:     body.comment,
      })
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/import-tkp — загружает xlsx ТКП, парсит и возвращает
 * предпросмотр с результатами матчинга к каталогу.
 * Multipart form-data, поле "file". Только engineer.
 */
router.post(
  '/analyses/:id/import-tkp',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  uploadRateLimit,
  uploadTkp.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' })
      return
    }

    try {
      if (!(await getAnalysisEditorAccess(params.id, req.user!.id)).capabilities.canImportTkp) { res.status(403).json({error:'Нет доступа к импорту анализа'}); return }
      const analysis = await getAnalysisListItemById(params.id)
      if (!analysis) {
        res.status(404).json({ error: 'Анализ не найден' })
        return
      }
      const allowSminex = isSminexEstimateContext(analysis)

      // memoryStorage — файл уже в req.file.buffer, диск не нужен
      let rows: RawRow[]
      let sourceFormat: '1c' | 'sminex'
      try {
        const parsed = await parseEstimate(req.file.buffer, { allowSminex })
        rows = parsed.rows
        sourceFormat = parsed.sourceFormat
      } catch (e) {
        if (e instanceof TkpParseError) {
          res.status(422).json({ error: e.message })
          return
        }
        throw e
      }

      // Загружаем каталог для матчинга
      const catalogItems = await getCatalogItemsForMatching(analysis.package_id)
      console.log(`[import-tkp] parsed ${rows.length} rows, catalog items: ${catalogItems.length}`)

      const matches = matchRowsToCatalog(rows, catalogItems, { positionalCodes: sourceFormat === 'sminex' })
      console.log(`[import-tkp] matched ${matches.filter((m) => m.catalogId !== null).length}/${rows.length} rows`)

      // Группируем материал-строки по parent_work_index — вложим в родительскую work-строку.
      const materialsByWorkIndex = new Map<number, Array<{ name: string; unit: string | null; quantity: number | null; coefficient: number | null }>>()
      for (const row of rows) {
        const rowType = deriveRowType(row)
        if (rowType === 'material' && row.parent_work_index != null) {
          const list = materialsByWorkIndex.get(row.parent_work_index) ?? []
          list.push({ name: row.name, unit: row.unit, quantity: row.quantity, coefficient: row.coefficient })
          materialsByWorkIndex.set(row.parent_work_index, list)
        }
      }

      // В превью идут только секции + работы; материалы вложены в каждую работу.
      const preview = rows
        .map((row, i) => ({
          index: i,
          row_type: deriveRowType(row),
          code: row.code,
          name: row.name,
          note: row.note,
          unit: row.unit,
          quantity: row.quantity,
          coefficient: row.coefficient,
          match: matches[i],
          materials: materialsByWorkIndex.get(i) ?? [],
        }))
        .filter((r) => r.row_type !== 'material')

      const workRows = preview.filter((p) => p.row_type !== 'section')
      const matchedCount2 = workRows.filter((p) => p.match.catalogId !== null).length

      res.json({
        total: rows.length,
        sourceFormat,
        total_work: workRows.length,
        matched: matchedCount2,
        unmatched: workRows.length - matchedCount2,
        materialsWithoutCoefficient: countMaterialsWithoutCoefficient(rows),
        rows: preview,
      })
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/import-tkp/provision-catalog — массово создаёт
 * недостающие позиции каталога из сметы Sminex (секции + работы, иерархия из
 * позиционных кодов). Только для пакетов с estimate_parser='sminex': у Sminex
 * каталог не предзаполнен, идентичность позиции — имя (+ ед. изм.), коды
 * генерируются. Возвращает назначения rowIndex → catalog_id для применения
 * overrides в MatchPreview. Расценки НЕ трогает — они заполняются импортом
 * собственного прайса в набор (POST /api/rates/:rateSetId/import).
 */
router.post('/analyses/:id/import-tkp/catalog-items',authMiddleware,requireRole('engineer','supervisor'),requireIdempotency('/api/analyses/:id/import-tkp/catalog-items'),async(req:Request,res:Response,next:NextFunction)=>{
  const params=parseOr400(analysisIdParamsSchema,req.params,res)
  const body=parseOr400(createCatalogItemBodySchema,req.body,res)
  if(!params||!body)return
  try{
    if(!(await getAnalysisEditorAccess(params.id,req.user!.id)).capabilities.canImportTkp){res.status(403).json({error:'Нет доступа к импорту анализа'});return}
    const analysis=await getAnalysisById(params.id)
    if(!analysis){res.status(404).json({error:'Анализ не найден'});return}
    res.status(201).json(await createImportCatalogItem(params.id,analysis.package_id,body,req.user!.id))
  }catch(e){next(e)}
})

router.post(
  '/analyses/:id/import-tkp/provision-catalog',
  authMiddleware,
  requireRole('engineer','supervisor'),
  requireIdempotency('/api/analyses/:id/import-tkp/provision-catalog'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(provisionCatalogBodySchema, req.body, res)
    if (!body) return

    try {
      if(!(await getAnalysisEditorAccess(params.id,req.user!.id)).capabilities.canImportTkp){res.status(403).json({error:'Нет доступа к импорту анализа'});return}
      const analysis = await getAnalysisListItemById(params.id)
      if (!analysis) {
        res.status(404).json({ error: 'Анализ не найден' })
        return
      }
      if (!isSminexEstimateContext(analysis)) {
        res.status(422).json({ error: 'Массовое добавление в каталог доступно только для смет Sminex' })
        return
      }

      const result = await provisionSminexCatalog({
        packageId: analysis.package_id,
        analysisId:params.id,userId:req.user!.id,
        rows: body.rows.map((r) => ({
          index: r.index,
          row_type: r.row_type,
          code: r.code,
          name: r.name,
          unit: r.unit,
          matched_catalog_id: r.matched_catalog_id,
        })),
      })
      console.log(
        `[provision-catalog] analysis=${params.id} created sections=${result.created_sections} works=${result.created_works}`,
      )
      res.json(result)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/import-tkp/confirm — подтверждает импорт выбранных строк.
 * Body: { items: [{ work_catalog_id, qty_total, coefficient? }] }.
 * Переиспользует существующую батч-логику addWorkItemsBatch.
 */
router.post(
  '/analyses/:id/import-tkp/confirm',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  requireIdempotency('/api/analyses/:id/import-tkp/confirm'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(importTkpConfirmBodySchema, req.body, res)
    if (!body) return

    try {
      const rateSetInfo = await getAnalysisRateSetInfo(params.id)

      if (!rateSetInfo) {
        res.status(422).json({ error: 'У анализа не привязан набор расценок' })
        return
      }

      const sectionIds = (body.sections ?? []).map((s) => s.work_catalog_id)
      const result = await confirmTkpImport({
        analysisId: params.id,
        executorType: rateSetInfo.executorType,
        contractorId: rateSetInfo.contractorId,
        userId: req.user!.id,
        items: body.items.map((item) => ({
          workCatalogId: item.work_catalog_id,
          qtyTotal: item.qty_total,
          coefficient: item.coefficient,
          note: item.note ?? null,
          materials: item.materials.map((material) => ({ ...material, unit: material.unit ?? null })),
        })),
        sectionIds,
      })

      res.status(201).json(result)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/import-tkp/diff — загружает новый ТКП, сравнивает с
 * текущими work_items и возвращает постро-чный diff (added/removed/changed/same).
 * Файл не сохраняется. Результат используется в DiffPreview перед применением.
 */
router.post(
  '/analyses/:id/import-tkp/diff',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  uploadRateLimit,
  uploadTkp.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' })
      return
    }

    try {
      if (!(await getAnalysisEditorAccess(params.id, req.user!.id)).capabilities.canImportTkp) { res.status(403).json({error:'Нет доступа к импорту анализа'}); return }
      const [analysis, rateSetInfo] = await Promise.all([
        getAnalysisListItemById(params.id),
        getAnalysisRateSetInfo(params.id),
      ])
      if (!analysis) {
        res.status(404).json({ error: 'Анализ не найден' })
        return
      }
      if (!rateSetInfo) {
        res.status(422).json({ error: 'У анализа не привязан набор расценок' })
        return
      }

      const allowSminex = isSminexEstimateContext(analysis)
      let allRows: RawRow[]
      let sourceFormat: '1c' | 'sminex'
      try {
        const parsed = await parseEstimate(req.file.buffer, { allowSminex })
        allRows = parsed.rows
        sourceFormat = parsed.sourceFormat
      } catch (e) {
        if (e instanceof TkpParseError) {
          res.status(422).json({ error: e.message })
          return
        }
        throw e
      }

      // Материалы вкладываем в родительскую работу по parent_work_index (индекс в allRows).
      // coefficient=0 — расходник в стоимости работы (не импортируется, §6.3, паритет с MatchPreview).
      const materialsByWorkIndex = new Map<number, Array<{ name: string; unit: string | null; quantity: number; coefficient: number }>>()
      allRows.forEach((row, i) => {
        const type = deriveRowType(row)
        if (type !== 'material' || row.parent_work_index == null) return
        if (row.quantity == null || row.coefficient == null || row.coefficient === 0) return
        const list = materialsByWorkIndex.get(row.parent_work_index) ?? []
        list.push({ name: row.name, unit: row.unit, quantity: row.quantity, coefficient: row.coefficient })
        materialsByWorkIndex.set(row.parent_work_index, list)
      })

      // Только work-строки (без секций и материалов); храним исходный индекс для материалов
      const newWorkRows = allRows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => deriveRowType(r) === 'work')
        .map(({ r, i }) => ({ ...r, _index: i, _materials: materialsByWorkIndex.get(i) ?? [] }))

      const [existingItems, catalogItems] = await Promise.all([
        getWorkItemsForDiff(params.id),
        getCatalogItemsForMatching(analysis.package_id),
      ])

      // Только work-строки из существующих (без секций)
      const existingWorkItems = existingItems.filter((wi) => wi.type_snapshot !== 'section')

      const matches = matchRowsToCatalog(newWorkRows, catalogItems, { positionalCodes: sourceFormat === 'sminex' })

      const completionMap = await getCompletionTotalsByWorkItems(
        existingWorkItems.map((wi) => wi.id),
      )

      // Multiset-матчинг по code+name+note: дубли кода (различимые только
      // примечанием или вовсе неразличимые) спариваются детерминированно.
      const diff = computeTkpDiff(
        newWorkRows
          .map((r, i) => ({
            code: r.code,
            name: r.name,
            note: r.note,
            unit: r.unit,
            quantity: r.quantity,
            catalogId: matches[i].catalogId,
            materials: r._materials,
            sourceFingerprint: r.source_fingerprint,
          }))
          .filter((r) => r.code),
        existingWorkItems,
        { positionalCodes: sourceFormat === 'sminex' },
      )

      const rows = diff.rows.map((row) => {
        const compl = row.workItemId ? completionMap.get(row.workItemId) : undefined
        return {
          ...row,
          hasCompletions: (compl?.count ?? 0) > 0 && row.status !== 'same',
          totalDone: row.status !== 'same' ? (compl?.totalDone ?? 0) : 0,
        }
      })

      res.json({
        summary: diff.summary,
        skipped: diff.skipped,
        executorType: rateSetInfo.executorType,
        contractorId: rateSetInfo.contractorId,
        sourceFormat,
        filename: decodeFilename(req.file.originalname),
        rowCount: allRows.length,
        materialsWithoutCoefficient: countMaterialsWithoutCoefficient(allRows),
        rows,
      })
    } catch (e) {
      next(e)
    }
  },
)

/**
 * POST /api/analyses/:id/import-tkp/apply-diff — применяет diff к БД через RPC merge_apply.
 * Body: { filename, row_count, rows[] } — только added/removed/changed строки.
 * tkp_imports, diff, rates, audit и материалы фиксируются одним атомарным RPC.
 */
router.post(
  '/analyses/:id/import-tkp/apply-diff',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  requireIdempotency('/api/analyses/:id/import-tkp/apply-diff'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(applyDiffBodySchema, req.body, res)
    if (!body) return

    try {
      const rateSetInfo = await getAnalysisRateSetInfo(params.id)
      if (!rateSetInfo) {
        res.status(422).json({ error: 'У анализа не привязан набор расценок' })
        return
      }

      const result = await applyTkpDiff({
        analysisId: params.id,
        filename: body.filename,
        rowCount: body.row_count,
        rows: body.rows,
        executorType: rateSetInfo.executorType,
        contractorId: rateSetInfo.contractorId,
        userId: req.user!.id,
      })

      const response: ApplyTkpDiffResponse = {
        batchId: result.batch_id,
        applied: {
          added: result.applied.added,
          removedHard: result.applied.removed_hard,
          removedSoft: result.applied.removed_soft,
          changed: result.applied.changed,
        },
        fixedPriceRebalances: result.fixed_price_rebalances,
      }
      res.json(response)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * PATCH /api/analyses/:id/system — инженер меняет систему анализа.
 * Body: { system_id: uuid | null }. Только draft-анализы.
 */
router.patch(
  '/analyses/:id/system',
  authMiddleware,
  requireRole('engineer', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    const body = parseOr400(updateAnalysisSystemBodySchema, req.body, res)
    if (!body) return

    try {
      const analysis = await getAnalysisById(params.id)
      if (!analysis) {
        res.status(404).json({ error: 'Анализ не найден' })
        return
      }
      if (analysis.status !== 'draft' && !(req.user!.role === 'supervisor' && analysis.status === 'pending_approval')) {
        res.status(422).json({ error: 'Систему можно менять только у черновика' })
        return
      }

      const updated = await updateAnalysisSystemId(params.id, body.system_id, req.user!.id)
      res.json(updated)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * GET /api/analyses/:id/history — лента изменений анализа из audit_log.
 * Возвращает записи сгруппированные по batch_id, с именами авторов и
 * human-readable деталями. Сортировка created_at DESC.
 */
router.get(
  '/analyses/:id/history',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!parsed) return
    try {
      await assertCanReadAnalysis(req.user!.id, req.user!.role, parsed.id)
      const data = await getAnalysisHistory(parsed.id)
      res.json(data)
    } catch (e) {
      next(e)
    }
  },
)

/** GET /api/work-items/:workItemId/materials — состав материалов позиции. */
router.get(
  '/work-items/:workItemId/materials',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(
      workItemParamsSchema.pick({ workItemId: true }),
      req.params,
      res,
    )
    if (!params) return
    try {
      await assertCanReadWorkItem(req.user!.id, req.user!.role, params.workItemId)
      const data = await getWorkItemMaterials(params.workItemId)
      res.json(data)
    } catch (e) {
      next(e)
    }
  },
)

/**
 * GET /api/analyses/:id/available-executors
 * Возвращает distinct (executor_type, contractor) пары из rates_reference,
 * у которых есть хотя бы одна активная расценка для обычных work_items анализа.
 * Используется прорабом в ExecutionView для выбора исполнителя при вводе объёма.
 */
router.get(
  '/analyses/:id/available-executors',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    try {
      await assertCanReadAnalysis(req.user!.id, req.user!.role, params.id)
      const executors = await listAvailableExecutors(params.id)
      res.json({ executors })
    } catch (e) { next(e) }
  },
)

/**
 * GET /api/analyses/:id/execution-sources
 * Возвращает наборы расценок, доступные прорабу при создании выполнения:
 * собственные силы (rate_set анализа) и подрядчики с их наборами расценок.
 */
router.get(
  '/analyses/:id/execution-sources',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    const params = parseOr400(analysisIdParamsSchema, req.params, res)
    if (!params) return
    try {
      await assertCanReadAnalysis(req.user!.id, req.user!.role, params.id)
      const sources = await listExecutionSources(params.id)
      res.json(sources)
    } catch (e) { next(e) }
  },
)

export default router
