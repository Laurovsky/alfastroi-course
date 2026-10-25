/**
 * Дифф нового ТКП против текущих work_items анализа.
 *
 * Ключевая проблема, которую решает модуль: в реальных ТКП один код работы
 * встречается несколько раз (различаются примечанием «Работы до 5-и метров» и т.п.),
 * а иногда дубли не различаются вообще ничем, кроме количества. Поэтому:
 *
 * 1. Матчинг — multiset с потреблением (каждый existing спаривается максимум один раз).
 * 2. Каскад ключей: code+name+note → code+name → code. Это переживает
 *    правку note/имени в новом ТКП (1:1) и legacy work_items без note_snapshot.
 * 3. Полные дубли спариваются по порядку вхождения (existing предварительно
 *    отсортированы → результат детерминирован независимо от порядка выборки из БД).
 * 4. Строки qty<=0 и строки без матча в каталоге не превращаются в невалидные
 *    added (источник 400 в apply-diff) — уходят в skipped с причиной.
 */

/** Материал в составе работы из нового ТКП (для added-строк). */
export interface TkpDiffMaterial {
  name: string
  unit: string | null
  quantity: number
  coefficient: number
}

export interface TkpDiffNewRow {
  code: string | null
  name: string
  note: string | null
  unit: string | null
  quantity: number | null
  /** Из matchRowsToCatalog; null — работы нет в каталоге пакета. */
  catalogId: string | null
  /** Состав материалов из ТКП; переносится только в added-строки. */
  materials?: TkpDiffMaterial[]
  /** Контентный отпечаток Sminex-строки; не включает позиционный код. */
  sourceFingerprint?: string | null
}

export interface TkpDiffExistingItem {
  id: string
  code_snapshot: string | null
  name: string
  note_snapshot: string | null
  unit: string | null
  qty_total: number
}

export type TkpDiffStatus = 'added' | 'removed' | 'changed' | 'same'

export interface TkpDiffRow {
  status: TkpDiffStatus
  workItemId: string | null
  catalogId: string | null
  code: string | null
  name: string
  note: string | null
  unit: string | null
  oldQty: number | null
  newQty: number | null
  qtyDelta: number | null
  /** Состав материалов из ТКП (added/changed/same) — для импорта в work_item_materials. */
  materials?: TkpDiffMaterial[]
}

export interface TkpSkippedRow {
  reason: 'zero_qty' | 'no_catalog_match'
  code: string | null
  name: string
  note: string | null
  unit: string | null
  quantity: number | null
  /** Только для no_catalog_match: состав из ТКП — нужен при ручном добавлении в каталог. */
  materials?: TkpDiffMaterial[]
}

export interface TkpDiffResult {
  rows: TkpDiffRow[]
  skipped: TkpSkippedRow[]
  summary: { added: number; removed: number; changed: number; same: number }
}

export interface TkpDiffOptions {
  /** row.code is positional and may change between Sminex estimate versions. */
  positionalCodes?: boolean
}

const QTY_TOLERANCE = 0.0001

/** Нормализация qty для ключа точного матчинга (консистентно с QTY_TOLERANCE). */
function qtyKey(q: number | null): string {
  return q == null ? '' : String(Math.round(q / QTY_TOLERANCE))
}

// Unicode-пробелы из выгрузок 1С (NBSP, thin space, narrow NBSP, ZWSP, BOM)
const UNICODE_WS_RE = /[   ​﻿]/g

function normText(s: string | null | undefined): string {
  if (!s || s === 'null') return ''
  return s.replace(UNICODE_WS_RE, ' ').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normCode(s: string | null | undefined): string {
  return (s ?? '').replace(UNICODE_WS_RE, '').replace(/\s+/g, '').toLowerCase()
}

/** Натуральное сравнение кодов: '6.10' > '6.2' (поэлементно числами, нечисловые — строкой). */
function compareCodes(a: string, b: string): number {
  const as = a.split('.')
  const bs = b.split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const sa = as[i] ?? ''
    const sb = bs[i] ?? ''
    if (sa === sb) continue
    const na = Number(sa)
    const nb = Number(sb)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return sa < sb ? -1 : 1
  }
  return 0
}

type KeyFn<T> = (row: T) => string

/**
 * Один проход матчинга: спаривает ещё не спаренные new-строки (в порядке файла)
 * с непотреблёнными existing по совпадению ключа, FIFO внутри ключа.
 */
function matchPass(
  newRows: TkpDiffNewRow[],
  pairs: Array<TkpDiffExistingItem | null>,
  existing: TkpDiffExistingItem[],
  consumed: Set<string>,
  newKey: KeyFn<TkpDiffNewRow>,
  existingKey: KeyFn<TkpDiffExistingItem>,
): void {
  const queues = new Map<string, TkpDiffExistingItem[]>()
  for (const item of existing) {
    if (consumed.has(item.id)) continue
    const k = existingKey(item)
    const q = queues.get(k)
    if (q) q.push(item)
    else queues.set(k, [item])
  }

  for (let i = 0; i < newRows.length; i++) {
    if (pairs[i] !== null) continue
    const q = queues.get(newKey(newRows[i]))
    if (!q) continue
    const item = q.shift()
    if (!item) continue
    pairs[i] = item
    consumed.add(item.id)
  }
}

export function computeTkpDiff(
  newRows: TkpDiffNewRow[],
  existingItems: TkpDiffExistingItem[],
  options: TkpDiffOptions = {},
): TkpDiffResult {
  const skipped: TkpSkippedRow[] = []

  const validNew = newRows.filter((r) => {
    if (r.quantity == null || r.quantity <= 0) {
      skipped.push({ reason: 'zero_qty', code: r.code, name: r.name, note: r.note, unit: r.unit, quantity: r.quantity })
      return false
    }
    return true
  })

  // Детерминированный порядок existing независимо от порядка выборки из БД.
  const existing = [...existingItems].sort(
    (a, b) =>
      compareCodes(normCode(a.code_snapshot), normCode(b.code_snapshot)) ||
      normText(a.name).localeCompare(normText(b.name)) ||
      normText(a.note_snapshot).localeCompare(normText(b.note_snapshot)) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

  const pairs: Array<TkpDiffExistingItem | null> = validNew.map(() => null)
  const consumed = new Set<string>()

  // Каскад: точный ключ+qty → точный ключ → без note → только код.
  // Проход с qty обязателен: у полных дублей (код+имя+note совпадают, как
  // 6.2.3.1.4.3.1.1 ×3) иначе пары зависят от порядка сортировки existing
  // по id → ложные перекрёстные changed («было 30 стало 4» + «было 4 стало 30»).
  matchPass(validNew, pairs, existing, consumed,
    (r) => `${normCode(r.code)}::${normText(r.name)}::${normText(r.note)}::${qtyKey(r.quantity)}`,
    (e) => `${normCode(e.code_snapshot)}::${normText(e.name)}::${normText(e.note_snapshot)}::${qtyKey(e.qty_total)}`)
  matchPass(validNew, pairs, existing, consumed,
    (r) => `${normCode(r.code)}::${normText(r.name)}::${normText(r.note)}`,
    (e) => `${normCode(e.code_snapshot)}::${normText(e.name)}::${normText(e.note_snapshot)}`)
  matchPass(validNew, pairs, existing, consumed,
    (r) => `${normCode(r.code)}::${normText(r.name)}`,
    (e) => `${normCode(e.code_snapshot)}::${normText(e.name)}`)
  if (options.positionalCodes) {
    matchPass(validNew, pairs, existing, consumed,
      (r) => `${normText(r.name)}::${normText(r.unit)}::${qtyKey(r.quantity)}`,
      (e) => `${normText(e.name)}::${normText(e.unit)}::${qtyKey(e.qty_total)}`)
    matchPass(validNew, pairs, existing, consumed,
      (r) => `${normText(r.name)}::${normText(r.unit)}`,
      (e) => `${normText(e.name)}::${normText(e.unit)}`)
  } else {
    matchPass(validNew, pairs, existing, consumed,
      (r) => normCode(r.code),
      (e) => normCode(e.code_snapshot))
  }

  const rows: TkpDiffRow[] = []
  const summary = { added: 0, removed: 0, changed: 0, same: 0 }

  for (let i = 0; i < validNew.length; i++) {
    const r = validNew[i]
    const pair = pairs[i]

    if (!pair) {
      if (!r.catalogId) {
        skipped.push({ reason: 'no_catalog_match', code: r.code, name: r.name, note: r.note, unit: r.unit, quantity: r.quantity, materials: r.materials ?? [] })
        continue
      }
      summary.added++
      rows.push({
        status: 'added', workItemId: null, catalogId: r.catalogId,
        code: r.code, name: r.name, note: r.note, unit: r.unit,
        oldQty: null, newQty: r.quantity, qtyDelta: null,
        materials: r.materials ?? [],
      })
      continue
    }

    const qtyChanged = Math.abs((r.quantity ?? 0) - pair.qty_total) > QTY_TOLERANCE
    if (qtyChanged) {
      summary.changed++
      rows.push({
        status: 'changed', workItemId: pair.id, catalogId: null,
        code: r.code, name: r.name, note: r.note, unit: r.unit,
        oldQty: pair.qty_total, newQty: r.quantity,
        qtyDelta: (r.quantity ?? 0) - pair.qty_total,
        materials: r.materials ?? [],
      })
    } else {
      summary.same++
      rows.push({
        status: 'same', workItemId: pair.id, catalogId: null,
        code: r.code, name: r.name, note: r.note, unit: r.unit,
        oldQty: pair.qty_total, newQty: r.quantity, qtyDelta: null,
        materials: r.materials ?? [],
      })
    }
  }

  for (const item of existing) {
    if (consumed.has(item.id)) continue
    summary.removed++
    rows.push({
      status: 'removed', workItemId: item.id, catalogId: null,
      code: item.code_snapshot, name: item.name, note: item.note_snapshot, unit: item.unit,
      oldQty: item.qty_total, newQty: null, qtyDelta: null,
    })
  }

  return { rows, skipped, summary }
}
