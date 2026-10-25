import { supabase } from '@/db/supabase'

/**
 * Conditional UPDATE с optimistic locking.
 *
 * Делает UPDATE table SET ..., version = version + 1 WHERE id = ? AND version = ?
 * Если затронуто 0 строк → ConflictError (запись изменена параллельно).
 *
 * Pattern из CLAUDE.md §2 — единственный способ изменять записи в analysis_rates,
 * work_items, execution_analyses, completions из application-кода.
 */
export class ConflictError extends Error {
  constructor(message = 'Запись была изменена другим пользователем') {
    super(message)
    this.name = 'ConflictError'
  }
}

/**
 * Сигнал «недостаточно прав» от RPC-функции (роль не та).
 * RPC бросает 'FORBIDDEN: ...' (ERRCODE 42501), rpcRunner ловит префикс,
 * errorHandler middleware превращает в HTTP 403.
 *
 * Дублирует логику requireRole middleware — defense-in-depth. RLS в Фазе 3
 * добавит третий рубеж на уровне БД.
 */
export class ForbiddenError extends Error {
  constructor(message = 'Недостаточно прав') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export interface ConditionalUpdateInput<T extends Record<string, unknown>> {
  table: string
  id: string
  prevVersion: number
  patch: T
}

export async function conditionalUpdate<T extends Record<string, unknown>, R>(
  input: ConditionalUpdateInput<T>,
): Promise<R> {
  const { data, error } = await supabase
    .from(input.table)
    .update({ ...input.patch, version: input.prevVersion + 1 })
    .eq('id', input.id)
    .eq('version', input.prevVersion)
    .select()
    .single()

  if (error) throw new Error(`conditionalUpdate: ${error.message}`)
  if (!data) throw new ConflictError()
  return data as R
}
