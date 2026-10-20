import "server-only";
import { db } from "@/lib/supabase/server";
import { LONG_WINDOW_DAYS, summariseBreakdowns, type BreakdownRow } from "./breakdowns";

const PAGE = 1000; // Supabase returns at most 1,000 rows per request

/** Loads the last 90 days of non-total observations (except per-site GA4, bar UTM campaigns) and summarises them. */
export async function computeBreakdowns(asOf: string) {
  const from = new Date(`${asOf}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - LONG_WINDOW_DAYS);
  const { data: metrics, error: mErr } = await db().from("metrics").select("key, aggregation");
  if (mErr) throw mErr;

  // Two plain filters rather than one OR: everything but per-site rows, then per-site UTM campaigns.
  const rows: BreakdownRow[] = [];
  for (const [op, pattern] of [["not like", "site:%"], ["like", "site:%|campaign:%"]] as const) {
    for (let offset = 0; ; offset += PAGE) {
      let q = db()
        .from("metric_observations")
        .select("metric_key, date, dimension, value")
        .neq("dimension", "")
        .gt("date", from.toISOString().slice(0, 10))
        .lte("date", asOf);
      q = op === "like" ? q.like("dimension", pattern) : q.not("dimension", "like", pattern);
      const { data, error } = await q.order("date").order("metric_key").order("dimension").range(offset, offset + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []).map((r) => ({ ...r, value: Number(r.value) })));
      if (!data || data.length < PAGE) break;
    }
  }
  return summariseBreakdowns(rows, new Map((metrics ?? []).map((m) => [m.key as string, m.aggregation as string])), asOf);
}
