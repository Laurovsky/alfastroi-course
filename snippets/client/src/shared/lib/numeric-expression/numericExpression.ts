/** Decimal arithmetic for table inputs. Never executes JavaScript or accepts partial input. */
export function parseNumericExpression(text: string): number | null {
  const source = text.trim();
  if (!source || source.length > 256) return null;
  const token = /\s*((?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?|[+*/-])/gy;
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    token.lastIndex = offset;
    const match = token.exec(source);
    if (!match) return null;
    tokens.push(match[1]);
    offset = token.lastIndex;
  }
  let index = 0,
    operations = 0;
  const number = (): number => {
    let sign = 1;
    if (tokens[index] === '-' || tokens[index] === '+') sign = tokens[index++] === '-' ? -1 : 1;
    const value = tokens[index++];
    if (!value || !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(value)) return NaN;
    return sign * Number(value.replace(',', '.'));
  };
  const product = (): number => {
    let value = number();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const op = tokens[index++],
        right = number();
      operations++;
      value = op === '*' ? value * right : right === 0 ? NaN : value / right;
    }
    return value;
  };
  let result = product();
  while (tokens[index] === '+' || tokens[index] === '-') {
    const op = tokens[index++],
      right = product();
    operations++;
    result = op === '+' ? result + right : result - right;
  }
  if (index !== tokens.length || !Number.isFinite(result)) return null;
  // Hide binary floating point noise in computed results; literal input retains its precision.
  const normalized = operations ? Number(result.toPrecision(15)) : result;
  return Number.isFinite(normalized) ? normalized : null;
}
