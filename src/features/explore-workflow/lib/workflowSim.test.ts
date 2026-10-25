import { describe, it, expect } from 'vitest';
import { actors, allowedActions, apply, ForbiddenError, initialState } from './workflowSim';

const [eng, supA, supB, admin, fore] = actors;
const names = (a: { action: string }[]) => a.map((x) => x.action);

describe('workflowSim', () => {
  it('только инженер отправляет черновик', () => {
    expect(names(allowedActions(initialState, eng))).toEqual(['submit']);
    expect(allowedActions(initialState, fore)).toEqual([]);
    expect(() => apply(initialState, fore, 'submit', ['supA'])).toThrow(ForbiddenError);
  });

  it('цепочка из двух: шаги последовательны', () => {
    let s = apply(initialState, eng, 'submit', ['supA', 'supB']);
    expect(names(allowedActions(s, supB))).toEqual([]);
    expect(names(allowedActions(s, supA))).toEqual(['approve', 'reject']);
    s = apply(s, supA, 'approve');
    expect(s.status).toBe('pending_approval');
    expect(names(allowedActions(s, supA))).toEqual([]);
    s = apply(s, supB, 'approve');
    expect(s.status).toBe('approved');
    expect(s.version).toBe(4);
  });

  it('admin — super-access, reject возвращает к автору', () => {
    let s = apply(initialState, eng, 'submit', ['supA']);
    s = apply(s, admin, 'reject');
    expect(s.status).toBe('draft');
    expect(s.chain).toEqual([]);
  });

  it('нужно 1–2 руководителя', () => {
    expect(() => apply(initialState, eng, 'submit', [])).toThrow('1–2');
  });
});
