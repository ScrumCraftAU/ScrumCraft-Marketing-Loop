import "server-only";
import { db } from "@/lib/supabase/server";
import { evaluateFormula, formulaInputs } from "./formula";

/**
 * Month-to-date total of a sum metric, for progress against a monthly target (e.g. marketing-sourced
 * revenue vs $30k/month). The metric tile's headline value is the week; the target is the month, so the
 * progress bar needs the month total. `marketing.revenue` is a derived sum (ticket_tailor.revenue +
 * hubspot.won_revenue + learnworlds.revenue) with no stored rows of its own, so a formula metric is
 * evaluated from its inputs' month totals; a stored metric sums its own '' observations for the month.
 * Assumes sum metrics (revenue); the caller gates on aggregation === "sum".
 *
 * @param monthStart first day of the month, "YYYY-MM-01"
 * @param through    last data date to include, "YYYY-MM-DD" (month-to-date, not the whole month)
 */
export async function getMonthToDate(metricKey: string, monthStart: string, through: string): Promise<number | null> {
  const supabase = db();
  const { data: metric } = await supabase.from("metrics").select("formula").eq("key", metricKey).maybeSingle();

  if (metric?.formula) {
    const inputs = [...new Set(formulaInputs(metric.formula))];
    const values: Record<string, number | null> = {};
    await Promise.all(
      inputs.map(async (key) => {
        values[key] = await getMonthToDate(key, monthStart, through);
      }),
    );
    return evaluateFormula(metric.formula, values);
  }

  const { data: rows } = await supabase
    .from("metric_observations")
    .select("value")
    .eq("metric_key", metricKey)
    .eq("dimension", "")
    .gte("date", monthStart)
    .lte("date", through);
  if (!rows?.length) return null;
  return rows.reduce((sum, r) => sum + Number(r.value), 0);
}
