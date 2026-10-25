import {isAnalysisReviewRequest, runAnalysisReviewMutation} from '@/modules/analyses/constructor/reviewMutation'
import { supabase } from '@/db/supabase'
import { ConflictError, ForbiddenError } from '@/lib/versionCheck'

/**
 * Типизированный wrapper над supabase.rpc для вызова Postgres-функций.
 * RPC = автоматическая транзакция: при ошибке Postgres делает rollback.
 *
 * Конвенция: RPC-функции бросают RAISE EXCEPTION с префиксом-меткой:
 *   'CONFLICT: ...'   → ConflictError → 409 (version mismatch / неподходящий status)
 *   'FORBIDDEN: ...'  → ForbiddenError → 403 (роль не та)
 * Всё прочее → generic Error → 500.
 *
 * Использование:
 *   const row = await runRpc<AnalysisRate>('update_rate', { p_rate_id, ... })
 */
export async function runRpc<TResult>(
  fnName: string,
  params: Record<string, unknown>,
): Promise<TResult> {
  if (isAnalysisReviewRequest(fnName)) return runAnalysisReviewMutation<TResult>(fnName, params, runRawRpc)
  return runRawRpc<TResult>(fnName, params)
}
export async function runRawRpc<TResult>(fnName: string,params: Record<string,unknown>): Promise<TResult> {
  const { data, error } = await supabase.rpc(fnName, params)
  if (error) {
    if (error.message.startsWith('CONFLICT:')) {
      throw new ConflictError(error.message.slice('CONFLICT:'.length).trim())
    }
    if (error.message.startsWith('FORBIDDEN:')) {
      throw new ForbiddenError(error.message.slice('FORBIDDEN:'.length).trim())
    }
    throw new Error(`rpc ${fnName}: ${error.message}`)
  }
  return data as TResult
}
