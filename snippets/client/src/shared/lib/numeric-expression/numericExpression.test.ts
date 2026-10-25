import { expect, it } from 'vitest';
import { parseNumericExpression } from './numericExpression';
it.each([
  ['150*0,9', 135],
  ['100+50*2', 200],
  ['150 / 2 - 10', 65],
  ['2*-3', -6],
  ['-15', -15],
  ['0.1+0.2', 0.3],
  ['1/3', 0.333333333333333],
  ['8/2*3', 12],
  ['10-2-3', 5],
  ['536.125', 536.125],
  ['0', 0],
  ['1e-7', 0.0000001]
])('evaluates %s', (text, value) => expect(parseNumericExpression(String(text))).toBe(value));
it.each([
  '',
  '10/0',
  '1+',
  'NaN',
  'Infinity',
  '1.2.3',
  '--1',
  '1 2',
  'alert(1)',
  '1e',
  '1.7976931348623157e308*1',
  '(1+2)',
  '2**3',
  '1;2',
  '9'.repeat(257)
])('rejects %s without evaluating code or partial operands', (text) =>
  expect(parseNumericExpression(text)).toBeNull()
);
