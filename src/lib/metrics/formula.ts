/**
 * Evaluates derived-metric formulas like "(a.x + b.y) / c.z" where identifiers are
 * metric keys. In a sum or difference a missing part counts as 0 (so a total still shows
 * while one source is unconnected), and the result is null only if every part is missing.
 * Multiplication and division return null if either side is missing, or on divide-by-zero.
 */
export function evaluateFormula(formula: string, values: Record<string, number | null>): number | null {
  const tokens = formula.match(/[A-Za-z_][\w.]*|\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  let pos = 0;

  const expr = (): number | null => {
    let left = term();
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++];
      const right = term();
      if (left === null && right === null) left = null;
      else left = op === "+" ? (left ?? 0) + (right ?? 0) : (left ?? 0) - (right ?? 0);
    }
    return left;
  };
  const term = (): number | null => {
    let left = factor();
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos++];
      const right = factor();
      if (left === null || right === null) left = null;
      else if (op === "*") left = left * right;
      else left = right === 0 ? null : left / right;
    }
    return left;
  };
  const factor = (): number | null => {
    const tok = tokens[pos++];
    if (tok === "(") {
      const v = expr();
      pos++; // ")"
      return v;
    }
    if (/^\d/.test(tok)) return Number(tok);
    return values[tok] ?? null;
  };

  return expr();
}

/** Metric keys referenced by a formula. */
export function formulaInputs(formula: string): string[] {
  return (formula.match(/[A-Za-z_][\w.]*/g) ?? []);
}
