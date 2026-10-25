import { describe, it, expect } from 'vitest'
import { deriveRowType } from './deriveRowType'

const row = (o: Partial<{ row_type: 'section' | 'work' | 'material' | null; unit: string | null; code: string | null }>) =>
  ({ row_type: undefined, unit: null, code: null, ...o })

describe('deriveRowType', () => {
  it('уважает уже проставленный row_type (Sminex-приоритет над эвристикой)', () => {
    expect(deriveRowType(row({ row_type: 'material', unit: null, code: '6.1' }))).toBe('material')
    expect(deriveRowType(row({ row_type: 'section', unit: 'шт', code: '6.1' }))).toBe('section')
  })

  it('unit null/пустой/пробельный → section', () => {
    expect(deriveRowType(row({ code: '6.1', unit: null }))).toBe('section')
    expect(deriveRowType(row({ code: '6.1', unit: '' }))).toBe('section')
    expect(deriveRowType(row({ code: '6.1', unit: '   ' }))).toBe('section')
  })

  it('code + unit → work', () => {
    expect(deriveRowType(row({ code: '6.1', unit: 'шт' }))).toBe('work')
  })

  it('unit без code → material', () => {
    expect(deriveRowType(row({ code: null, unit: 'м' }))).toBe('material')
    expect(deriveRowType(row({ code: '', unit: 'м' }))).toBe('material')
    // Пробельный код — материал (trim): раньше инлайн-версия ошибочно давала work.
    expect(deriveRowType(row({ code: '  ', unit: 'м' }))).toBe('material')
  })
})
