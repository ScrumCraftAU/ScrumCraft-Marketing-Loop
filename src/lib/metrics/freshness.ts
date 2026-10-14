/**
 * Whether a metric is receiving data (the metric catalog's Online / Offline lozenge).
 * A stored metric is online when it has an observation in the last `windowDays` days; a
 * derived metric is online only when every metric in its formula is (following derived inputs
 * down to stored ones). Dependency-free for tests.
 */
import { formulaInputs } from "./formula.ts";

export const FRESH_WINDOW_DAYS = 7;

export function isOnline(
  metric: { key: string; formula: string | null },
  latest: Map<string, string>,
  today: string,
  formulas: Map<string, string | null> = new Map(),
  windowDays = FRESH_WINDOW_DAYS,
): boolean {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const check = (key: string, formula: string | null, seen: Set<string>): boolean => {
    if (!formula) {
      const d = latest.get(key);
      return Boolean(d && new Date(`${d}T00:00:00Z`) >= cutoff);
    }
    if (seen.has(key)) return false; // circular formula
    seen.add(key);
    const inputs = formulaInputs(formula);
    return inputs.length > 0 && inputs.every((k) => check(k, formulas.get(k) ?? null, seen));
  };
  return check(metric.key, metric.formula, new Set());
}
