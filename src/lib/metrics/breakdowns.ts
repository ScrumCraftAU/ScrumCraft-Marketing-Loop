/**
 * Dimension breakdowns for the loop (where revenue, pipeline, enrolments and traffic come from).
 * Stats (stats.ts) only read totals (dimension ''); this summarises the `<prefix>:<value>`
 * dimensions the pulls store, e.g. hubspot.won_revenue by source:<deal source>.
 * Dependency-free for tests; the database read lives in breakdowns-load.ts.
 *
 * Windows: deals and Academy sales are lumpy, so sums are given for the last 7 and last 90 days
 * (with the first day that has data, since pulls only backfill 42 days to a year). Snapshot
 * metrics (aggregation "last", e.g. open pipeline) give the latest day's values instead.
 * Per-site GA4 numbers are left out (the loop gets them as web_properties).
 */

export const BREAKDOWN_PREFIXES = ["source", "reason", "course", "channel", "page"] as const;
export const SKIP_METRICS = new Set(["gsc.position_weight"]); // only meaningful divided by impressions
export const LONG_WINDOW_DAYS = 90;
export const TOP_N = 10;

export interface BreakdownRow {
  metric_key: string;
  date: string;
  dimension: string;
  value: number;
}

export interface Breakdown {
  metric_key: string;
  by: string; // dimension prefix, e.g. "source"
  window: "last_7_days" | "last_90_days" | "latest";
  as_of: string; // last day in the window (latest: the snapshot day)
  data_from: string; // first day with data in the window
  values: { label: string; value: number }[]; // largest first, top TOP_N
  others: number; // labels beyond TOP_N, summed into other_total
  other_total: number;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function summariseBreakdowns(rows: BreakdownRow[], aggregation: Map<string, string>, asOf: string): Breakdown[] {
  const groups = new Map<string, BreakdownRow[]>(); // metric_key \0 prefix
  for (const r of rows) {
    const prefix = r.dimension.split(":", 1)[0];
    if (SKIP_METRICS.has(r.metric_key) || !(BREAKDOWN_PREFIXES as readonly string[]).includes(prefix) || r.date > asOf) continue;
    const k = `${r.metric_key}\u0000${prefix}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const out: Breakdown[] = [];
  const summarise = (metric_key: string, by: string, window: Breakdown["window"], picked: BreakdownRow[], as_of: string) => {
    if (!picked.length) return;
    const totals = new Map<string, number>();
    for (const r of picked) {
      const label = r.dimension.slice(by.length + 1);
      totals.set(label, (totals.get(label) ?? 0) + r.value);
    }
    const sorted = [...totals].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return;
    const rest = sorted.slice(TOP_N);
    out.push({
      metric_key,
      by,
      window,
      as_of,
      data_from: picked.reduce((m, r) => (r.date < m ? r.date : m), picked[0].date),
      values: sorted.slice(0, TOP_N).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })),
      others: rest.length,
      other_total: Math.round(rest.reduce((a, [, v]) => a + v, 0) * 100) / 100,
    });
  };

  for (const [k, group] of groups) {
    const [metric_key, by] = k.split("\u0000");
    if (aggregation.get(metric_key) === "last") {
      const latest = group.reduce((m, r) => (r.date > m ? r.date : m), group[0].date);
      summarise(metric_key, by, "latest", group.filter((r) => r.date === latest), latest);
    } else if (aggregation.get(metric_key) === "sum") {
      summarise(metric_key, by, "last_7_days", group.filter((r) => r.date > addDays(asOf, -7)), asOf);
      summarise(metric_key, by, "last_90_days", group.filter((r) => r.date > addDays(asOf, -LONG_WINDOW_DAYS)), asOf);
    }
    // "avg" metrics can't be summed across days or labels; none are broken down today.
  }
  return out.sort((a, b) => a.metric_key.localeCompare(b.metric_key) || a.by.localeCompare(b.by) || a.window.localeCompare(b.window));
}
