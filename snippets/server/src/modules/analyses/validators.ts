import { z } from 'zod'

export const analysisIdParamsSchema = z.object({
  id: z.string().uuid(),
})

export const projectIdQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  context: z.literal('constructor').optional(),
})

/** Тело для статусных транзишенов: prev_version обязателен (optimistic locking). */
export const versionedBodySchema = z.object({
  prev_version: z.number().int().nonnegative(),
})

/** Тело для отправки анализа на согласование: prev_version + список согласующих (1–2). */
export const submitForApprovalBodySchema = z.object({
  prev_version: z.number().int().nonnegative(),
  approver_ids: z.array(z.string().uuid()).min(1).max(2)
    .refine((a) => new Set(a).size === a.length, 'руководители должны различаться'),
})

export const createAnalysisBodySchema = z.object({
  project_id: z.string().uuid(),
  package_id: z.string().uuid(),
  system_id: z.string().uuid().nullable().optional(),
  rate_set_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Название не может быть пустым').max(200),
})

export type CreateAnalysisBody = z.infer<typeof createAnalysisBodySchema>

export const updateAnalysisNameBodySchema = z.object({
  name: z.string().trim().min(1, 'Название не может быть пустым').max(200),
  prev_version: z.number().int().nonnegative(),
})

export type UpdateAnalysisNameBody = z.infer<typeof updateAnalysisNameBodySchema>

/** Params для маршрутов вида /analyses/:id/work-items/:workItemId. */
export const workItemParamsSchema = z.object({
  id: z.string().uuid(),
  workItemId: z.string().uuid(),
})

/** Тело для inline-правки qty_total у work_item. */
export const updateWorkItemQtySchema = z.object({
  prev_version: z.number().int().nonnegative(),
  qty_total: z.number().positive('Количество должно быть больше нуля'),
})

export type UpdateWorkItemQtyBody = z.infer<typeof updateWorkItemQtySchema>

export const updateWorkItemNoteSchema = z.object({
  prev_version: z.number().int().nonnegative(),
  note: z.string().nullable(),
})
export type UpdateWorkItemNoteBody = z.infer<typeof updateWorkItemNoteSchema>

/** Тело для добавления позиции из каталога в анализ. */
export const addWorkItemBodySchema = z.object({
  work_catalog_id: z.string().uuid(),
  qty_total: z.number().positive('Количество должно быть больше нуля'),
  coefficient: z.number().positive().optional().default(1),
})

export type AddWorkItemBody = z.infer<typeof addWorkItemBodySchema>

/** Тело для батч-добавления позиций — массив добавлений за один HTTP-вызов. */
export const addWorkItemsBatchBodySchema = z.object({
  items: z
    .array(addWorkItemBodySchema)
    .min(1, 'Список позиций пуст')
    .max(200, 'Слишком много позиций за один запрос'),
})

export type AddWorkItemsBatchBody = z.infer<typeof addWorkItemsBatchBodySchema>

const tkpMaterialSchema = z.object({
  name: z.string().min(1),
  unit: z.string().nullable().optional(),
  // ТКП из 1С содержит строки-корректировки с отрицательным кол-вом. Не валим
  // весь импорт 400-кой — принимаем любое конечное число, а непозитивные
  // позиции отсеиваются при агрегации (aggregateMaterialRows).
  quantity: z.number().finite(),
  coefficient: z.number().min(0),
})

/** Тело подтверждения импорта ТКП: инженер выбирает строки для импорта. */
export const importTkpConfirmBodySchema = z.object({
  items: z
    .array(
      z.object({
        work_catalog_id: z.string().uuid(),
        qty_total: z.number().positive('Количество должно быть больше нуля'),
        coefficient: z.number().positive().optional().default(1),
        /** Примечание из ТКП → work_items.note_snapshot (различает дубли кода). */
        note: z.string().max(2000).nullable().optional(),
        /** Материалы в составе работы — из ТКП, привязываются к созданному work_item. */
        materials: z.array(tkpMaterialSchema).optional().default([]),
      }),
    )
    .min(1, 'Нет строк для импорта')
    .max(500, 'Слишком много строк для одного запроса'),
  /** Section-строки из ТКП: заголовки иерархии. Добавляются как work_item с type=section. */
  sections: z
    .array(z.object({ work_catalog_id: z.string().uuid() }))
    .optional()
    .default([]),
})

export type ImportTkpConfirmBody = z.infer<typeof importTkpConfirmBodySchema>

/**
 * Тело массового создания позиций каталога из сметы Sminex (provision-catalog).
 * Клиент шлёт секции и работы предпросмотра в исходном порядке сметы —
 * порядок несёт иерархию (анонимные подразделы привязываются по позиции).
 */
export const provisionCatalogBodySchema = z.object({
  rows: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        row_type: z.enum(['section', 'work']),
        code: z.string().max(100).nullable(),
        name: z.string().min(1).max(2000),
        unit: z.string().max(100).nullable(),
        matched_catalog_id: z.string().uuid().nullable().optional().default(null),
      }),
    )
    .min(1, 'Нет строк для добавления')
    .max(2000, 'Слишком много строк для одного запроса'),
})

export type ProvisionCatalogBody = z.infer<typeof provisionCatalogBodySchema>

/** Batch-удаление work_items. */
export const deleteWorkItemsBatchBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
})

/** Query-параметры для GET /execution-view. */
export const executionViewQuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'period должен быть YYYY-MM')
    .optional(),
  batch_id: z.string().uuid().optional(),
})

export const executionHistoryQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period должен быть YYYY-MM'),
  execution_batch_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2048).optional(),
})

/** Тело для смены системы анализа. */
export const updateAnalysisSystemBodySchema = z.object({
  system_id: z.string().uuid().nullable(),
})

export type UpdateAnalysisSystemBody = z.infer<typeof updateAnalysisSystemBodySchema>

/** Строки diff для применения merge через RPC merge_apply. */
export const applyDiffBodySchema = z.object({
  filename: z.string().min(1).max(255),
  row_count: z.number().int().nonnegative(),
  rows: z
    .array(
      z.discriminatedUnion('status', [
        z.object({
          status: z.literal('added'),
          catalogId: z.string().uuid(),
          newQty: z.number().positive(),
          coefficient: z.number().positive().optional().default(1),
          /** Примечание из ТКП → work_items.note_snapshot (различает дубли кода). */
          note: z.string().max(2000).nullable().optional(),
          /** Состав материалов из ТКП → work_item_materials созданной работы. */
          materials: z.array(tkpMaterialSchema).optional().default([]),
        }),
        z.object({
          status: z.literal('removed'),
          workItemId: z.string().uuid(),
        }),
        z.object({
          status: z.literal('changed'),
          workItemId: z.string().uuid(),
          newQty: z.number().positive(),
          /** Состав материалов из ТКП → upsert в work_item_materials. */
          materials: z.array(tkpMaterialSchema).optional().default([]),
        }),
        z.object({
          status: z.literal('same'),
          workItemId: z.string().uuid(),
          /** Состав материалов из ТКП → upsert (ресинк состава без изменения qty). */
          materials: z.array(tkpMaterialSchema).optional().default([]),
        }),
      ]),
    )
    .min(1, 'Нет строк для применения')
    .max(2000),
})

export type ApplyDiffBody = z.infer<typeof applyDiffBodySchema>

/** Тело для возврата анализа на доработку: prev_version + обязательный комментарий. */
export const rejectAnalysisBodySchema = z.object({
  prev_version: z.number().int().nonnegative(),
  comment: z.string().trim().min(1, 'Комментарий обязателен'),
})

export type RejectAnalysisBody = z.infer<typeof rejectAnalysisBodySchema>
