import { describe, it, expect } from 'vitest'
import type { Client } from 'pg'
import { withRollback, USERS, PKG, PROJECT, WCAT_B } from './client'

/** Пустой approved-анализ без work_items + rates_reference для WCAT_B. */
async function emptyAnalysis(c: Client): Promise<string> {
  const rs = await c.query(
    `INSERT INTO rate_sets (name, package_id, executor_type, contractor_id, valid_from, created_by)
     VALUES ('rs', $1, 'ss', NULL, now(), $2) RETURNING id`, [PKG, USERS.engineer])
  const rateSetId = rs.rows[0].id
  await c.query(
    `INSERT INTO rates_reference (work_catalog_id, executor_type, contractor_id, unit_rate, valid_from, rate_set_id, created_by)
     VALUES ($1,'ss',NULL,77, now(), $2, $3)`, [WCAT_B, rateSetId, USERS.engineer])
  const an = await c.query(
    `INSERT INTO execution_analyses (project_id, package_id, name, rate_set_id, status, created_by)
     VALUES ($1,$2,'A',$3,'approved',$4) RETURNING id`,
    [PROJECT, PKG, rateSetId, USERS.engineer])
  return an.rows[0].id
}

describe('add_work_item_with_rate', () => {
  it('engineer добавляет work_item + analysis_rate(is_baseline=TRUE)', async () => {
    await withRollback(async (c) => {
      const analysisId = await emptyAnalysis(c)
      await c.query(`SELECT add_work_item_with_rate($1,$2,'Работа Б','м3',1,5,'ss',NULL,$3)`,
        [analysisId, WCAT_B, USERS.engineer])
      const wi = await c.query(`SELECT qty_total FROM work_items WHERE analysis_id=$1`, [analysisId])
      expect(wi.rows).toHaveLength(1)
      expect(Number(wi.rows[0].qty_total)).toBe(5)
      const ar = await c.query(
        `SELECT is_baseline FROM analysis_rates WHERE analysis_id=$1 AND work_catalog_id=$2`,
        [analysisId, WCAT_B])
      expect(ar.rows[0].is_baseline).toBe(true)
    })
  })

  it('пишет audit_log (action=create)', async () => {
    await withRollback(async (c) => {
      const analysisId = await emptyAnalysis(c)
      await c.query(`SELECT add_work_item_with_rate($1,$2,'Работа Б','м3',1,5,'ss',NULL,$3)`,
        [analysisId, WCAT_B, USERS.engineer])
      const a = await c.query(`SELECT count(*)::int AS n FROM audit_log WHERE action='create'`)
      expect(a.rows[0].n).toBeGreaterThan(0)
    })
  })

  it('qty_total <= 0 → CONFLICT', async () => {
    await withRollback(async (c) => {
      const analysisId = await emptyAnalysis(c)
      await expect(c.query(`SELECT add_work_item_with_rate($1,$2,'X','м3',1,0,'ss',NULL,$3)`,
        [analysisId, WCAT_B, USERS.engineer]))
        .rejects.toThrow(/CONFLICT/)
    })
  })

  it('не engineer (p_changed_by=foreman) → FORBIDDEN', async () => {
    await withRollback(async (c) => {
      const analysisId = await emptyAnalysis(c)
      await expect(c.query(`SELECT add_work_item_with_rate($1,$2,'X','м3',1,5,'ss',NULL,$3)`,
        [analysisId, WCAT_B, USERS.foreman]))
        .rejects.toThrow(/FORBIDDEN/)
    })
  })

  it('один код + разные note → две baseline; тот же note → reuse (мигр.077)', async () => {
    await withRollback(async (c) => {
      const analysisId = await emptyAnalysis(c)
      // высотные
      await c.query(`SELECT add_work_item_with_rate($1,$2,'Работа Б','м3',1,5,'ss',NULL,$3,$4)`,
        [analysisId, WCAT_B, USERS.engineer, 'работы на высоте'])
      // обычные (note NULL)
      await c.query(`SELECT add_work_item_with_rate($1,$2,'Работа Б','м3',1,3,'ss',NULL,$3,NULL)`,
        [analysisId, WCAT_B, USERS.engineer])
      // дубль высотных — тот же note → reuse baseline, без новой строки
      await c.query(`SELECT add_work_item_with_rate($1,$2,'Работа Б','м3',1,2,'ss',NULL,$3,$4)`,
        [analysisId, WCAT_B, USERS.engineer, 'работы на высоте'])
      const ar = await c.query(
        `SELECT note FROM analysis_rates WHERE analysis_id=$1 AND work_catalog_id=$2 AND is_baseline ORDER BY note NULLS FIRST`,
        [analysisId, WCAT_B])
      expect(ar.rows.map((r) => r.note)).toEqual([null, 'работы на высоте'])
    })
  })
})
