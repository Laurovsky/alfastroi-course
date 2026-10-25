import type { RowType } from '@/modules/analyses/constructor/types'

/** Минимум признаков для классификации. row_type допускает null (call-sites с nullable-полем). */
export interface RowTypeInput {
  row_type?: RowType | null
  unit: string | null
  code: string | null
}

/**
 * Каноническое определение типа строки ТКП по её признакам.
 *
 * Единая истина для всего пайплайна импорта (парсер, матчинг, превью, diff,
 * подсчёт материалов). Раньше эвристика дублировалась инлайном в 6 местах в
 * слегка РАЗНЫХ формах: `row.unit === null ? 'section' : row.code ? 'work' : …`
 * не триммил — строка с `unit=''` или пробельным кодом классифицировалась иначе,
 * чем в `TKPParser.detectRowType` (латентная рассинхронизация). Здесь — одна
 * триммящая версия, на неё ссылаются все.
 *
 * Приоритет: если парсер уже проставил `row_type` (Sminex: секции по префиксу
 * кода, материалы по атрибуту) — уважаем его; эвристика по unit/code — fallback.
 *
 *   unit пуст/пробелы           → section (заголовок раздела)
 *   code задан, unit задан      → work (работа)
 *   code пуст, unit задан       → material (материал)
 */
export function deriveRowType(row: RowTypeInput): RowType {
  if (row.row_type) return row.row_type
  if (row.unit === null || row.unit.trim() === '') return 'section'
  if (row.code !== null && row.code.trim() !== '') return 'work'
  return 'material'
}
