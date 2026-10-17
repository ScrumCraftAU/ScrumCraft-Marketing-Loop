import "server-only";
import { db } from "@/lib/supabase/server";
import { LONG_WINDOW_DAYS, summariseBreakdowns, type BreakdownRow } from "./breakdowns";

const PAGE = 1000; // Supabase returns at most 1,000 rows per request

/** Loads the last 90 days of non-total observations (except per-site GA4) and summarises them. */
export async function computeBreakdowns(asOf: string) {
  const from = new Date(`${asOf}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - LONG_WINDOW_DAYS);
  const { data: metrics, error: mErr } = await db().from("metrics").select("key, aggregation");
  if (mErr) throw mErr;

  const rows: BreakdownRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db()
      .from("metric_observations")
      .select("metric_key, date, dimension, value")
      .neq("dimension", "")
      .not("dimension", "like", "site:%")
      .gt("date", from.toISOString().slice(0, 10))
      .lte("date", asOf)
      .order("date")
      .order("metric_key")
      .order("dimension")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []).map((r) => ({ ...r, value: Number(r.value) })));
    if (!data || data.length < PAGE) break;
  }
  return summariseBreakdowns(rows, new Map((metrics ?? []).map((m) => [m.key as string, m.aggregation as string])), asOf);
}
