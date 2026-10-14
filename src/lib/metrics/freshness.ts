/**
 * Whether a metric is receiving data (the metric catalog's Online / Offline lozenge).
 * A stored metric is online when it has an observation in the last `windowDays` days; a
 * derived metric is online only when every metric in its formula is. Dependency-free for tests.
 */
export const FRESH_WINDOW_DAYS = 7;

const FORMULA_KEY = /[a-z][a-z0-9_]*\.[a-z0-9_]+/g;

export function formulaInputs(formula: string): string[] {
  return [...new Set(formula.match(FORMULA_KEY) ?? [])];
}

export function isOnline(
  metric: { key: string; formula: string | null },
  latest: Map<string, string>,
  today: string,
  windowDays = FRESH_WINDOW_DAYS,
): boolean {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const fresh = (key: string) => {
    const d = latest.get(key);
    return Boolean(d && new Date(`${d}T00:00:00Z`) >= cutoff);
  };
  if (!metric.formula) return fresh(metric.key);
  const inputs = formulaInputs(metric.formula);
  return inputs.length > 0 && inputs.every(fresh);
}
