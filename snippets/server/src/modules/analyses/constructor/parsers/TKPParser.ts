import type { RawRow, RowType, DetectedSystem } from '@/modules/analyses/constructor/types'
import { deriveRowType } from '@/modules/analyses/constructor/deriveRowType'

/**
 * Абстрактный базовый класс для парсеров ТКП.
 * Полиморфизм: XlsxTKPParser, PdfTKPParser (TODO).
 * Общая логика (buildHierarchy, detectRowType, detectSystems) живёт здесь
 * как protected — доступна всем форматам без дублирования.
 */
export abstract class TKPParser {
  /** Разбирает файл в массив строк ТКП. Реализуется в каждом формате. */
  abstract parse(file: Buffer | Uint8Array): Promise<RawRow[]>

  /**
   * Определяет тип строки по признакам:
   * unit === null → section (заголовок раздела)
   * code !== null && unit !== null → work (работа)
   * code === null && unit !== null → material (материал)
   */
  protected detectRowType(row: RawRow): RowType {
    // Делегирует в общий deriveRowType (единая истина для всего пайплайна).
    // Игнорируем уже проставленный row_type — здесь это низкоуровневая эвристика.
    return deriveRowType({ row_type: undefined, unit: row.unit, code: row.code })
  }

  /**
   * Заполняет parent_node_code и row_type для каждой строки.
   * parent_node_code: "6.2.2.2.3.5" → "6.2.2.2.3" (убираем последний сегмент через точку).
   * Строки без code (material, section) получают parent_node_code из ближайшей предшествующей работы.
   * Если парсер уже проставил row_type (Sminex: секции по префиксу кода,
   * материалы по атрибуту) — уважаем его, эвристика по unit только fallback.
   */
  protected buildHierarchy(rows: RawRow[]): RawRow[] {
    let lastWorkIndex: number | null = null

    return rows.map((row, i) => {
      const rowType = row.row_type ?? this.detectRowType(row)
      let parentNodeCode: string | null = null

      if (row.code) {
        const lastDot = row.code.lastIndexOf('.')
        parentNodeCode = lastDot > 0 ? row.code.slice(0, lastDot) : null
      }

      if (rowType === 'work') lastWorkIndex = i
      const parentWorkIndex = rowType === 'material' ? lastWorkIndex : null

      return { ...row, row_type: rowType, parent_node_code: parentNodeCode, parent_work_index: parentWorkIndex }
    })
  }

  /**
   * Группирует строки по section-заголовкам → список обнаруженных систем.
   * Секция начинается при row_type === 'section'. rootNodeCode берётся из
   * первой работы (row_type === 'work') этой секции — общий префикс кодов.
   *
   * Пример: секция "Вентиляция приточная" содержит коды "6.2.2.2.3.5", "6.2.2.2.4.1" →
   *   rootNodeCode = "6.2.2.2" (общие 4 сегмента).
   */
  protected detectSystems(rows: RawRow[]): DetectedSystem[] {
    const systems: DetectedSystem[] = []
    let currentName: string | null = null
    let currentCodes: string[] = []
    let currentCount = 0

    const flushSystem = () => {
      if (currentName === null || currentCount === 0) return
      const rootCode = findCommonPrefix(currentCodes)
      systems.push({
        rootNodeCode: rootCode,
        name: currentName,
        rowCount: currentCount,
      })
    }

    for (const row of rows) {
      const type = row.row_type ?? this.detectRowType(row)
      if (type === 'section') {
        flushSystem()
        currentName = row.name
        currentCodes = []
        currentCount = 0
      } else {
        currentCount++
        if (row.code) currentCodes.push(row.code)
      }
    }
    flushSystem()

    return systems
  }
}

/** Находит общий префикс кодов (по сегментам через точку). */
function findCommonPrefix(codes: string[]): string {
  if (codes.length === 0) return ''
  const segments = codes[0].split('.')
  let depth = segments.length
  for (const code of codes.slice(1)) {
    const parts = code.split('.')
    let match = 0
    for (let i = 0; i < Math.min(depth, parts.length); i++) {
      if (parts[i] === segments[i]) match++
      else break
    }
    depth = Math.min(depth, match)
    if (depth === 0) return ''
  }
  return segments.slice(0, depth).join('.')
}
