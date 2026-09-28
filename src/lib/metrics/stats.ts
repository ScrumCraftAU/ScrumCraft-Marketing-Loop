import "server-only";
import { format, subDays } from "date-fns";
import { db } from "@/lib/supabase/server";
import { evaluateFormula } from "@/lib/metrics/formula";
import type { Metric } from "@/lib/types";

/** Weekly windows: this week (7d to asOf), last week, and the 4 weeks before this week. */
const WEEK = 7;
const BASELINE_WEEKS = 4;
const HISTORY_DAYS = WEEK * (BASELINE_WEEKS + 1);

export interface MetricStats {
  metric: Metric;
  current: number | null;   // this week
  prior: number | null;     // last week
  baseline: number | null;  // average week over the prior 4 weeks
  changeVsPrior: number | null;    // fraction, e.g. 0.12 = +12%
  changeVsBaseline: number | null;
  /** Direction-adjusted: positive = good for the business. */
  signal: number | null;
  flag: "none" | "watch" | "alert";
  series: { date: string; value: number | null }[]; // daily, oldest → newest
  dataDays: number; // days in the current window with data
}

export interface StatsSnapshot {
  asOf: string;
  periodStart: string;
  metrics: MetricStats[];
}

type Daily = Map<string, Map<string, number>>; // metric_key → date → value

function aggregate(metric: Metric, daily: Daily, dates: string[]): number | null {
  const byDate = daily.get(metric.key);
  const vals = dates.map((d) => byDate?.get(d)).filter((v): v is number => v !== undefined);
  if (vals.length === 0) return null;
  if (metric.aggregation === "sum") return vals.reduce((a, b) => a + b, 0);
  if (metric.aggregation === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals[vals.length - 1]; // last
}

/**
 * Aggregates every metric over a set of dates. Derived metrics are computed from their
 * inputs' window aggregates (ratio of sums, not average of daily ratios), resolving
 * derived-on-derived dependencies by repeated passes.
 */
function aggregateAll(metrics: Metric[], daily: Daily, dates: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of metrics) if (!m.formula) out[m.key] = aggregate(m, daily, dates);
  const derived = metrics.filter((m) => m.formula);
  for (let pass = 0; pass < derived.length; pass++) {
    for (const m of derived) out[m.key] = evaluateFormula(m.formula!, out);
  }
  return out;
}

const pct = (a: number | null, b: number | null) =>
  a === null || b === null || b === 0 ? null : (a - b) / Math.abs(b);

function datesBack(end: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => format(subDays(end, days - 1 - i), "yyyy-MM-dd"));
}

/** Loads the catalog + last 5 weeks of observations and computes week-over-week stats. */
export async function computeStats(asOfDate?: Date): Promise<StatsSnapshot> {
  // Default to yesterday: today's data is usually incomplete.
  const asOf = asOfDate ?? subDays(new Date(), 1);
  const allDates = datesBack(asOf, HISTORY_DAYS);
  const from = allDates[0];
  const to = allDates[allDates.length - 1];

  const [{ data: metrics, error: mErr }, { data: obs, error: oErr }] = await Promise.all([
    db().from("metrics").select("*").eq("active", true).order("sort_order"),
    db()
      .from("metric_observations")
      .select("metric_key, date, value")
      .eq("dimension", "")
      .gte("date", from)
      .lte("date", to),
  ]);
  if (mErr) throw mErr;
  if (oErr) throw oErr;

  const daily: Daily = new Map();
  for (const o of obs ?? []) {
    if (!daily.has(o.metric_key)) daily.set(o.metric_key, new Map());
    daily.get(o.metric_key)!.set(o.date, Number(o.value));
  }

  const catalog = (metrics ?? []) as Metric[];
  const thisWeek = allDates.slice(-WEEK);
  const lastWeek = allDates.slice(-2 * WEEK, -WEEK);
  const baselineWeeks = Array.from({ length: BASELINE_WEEKS }, (_, w) =>
    allDates.slice(w * WEEK, (w + 1) * WEEK),
  );

  const cur = aggregateAll(catalog, daily, thisWeek);
  const prev = aggregateAll(catalog, daily, lastWeek);
  const base = baselineWeeks.map((dates) => aggregateAll(catalog, daily, dates));
  const perDay = allDates.map((d) => ({ date: d, values: aggregateAll(catalog, daily, [d]) }));

  const result: MetricStats[] = catalog.map((m) => {
    const baseVals = base.map((b) => b[m.key]).filter((v): v is number => v !== null);
    const baseline = baseVals.length ? baseVals.reduce((a, b) => a + b, 0) / baseVals.length : null;
    const changeVsPrior = pct(cur[m.key], prev[m.key]);
    const changeVsBaseline = pct(cur[m.key], baseline);
    const signal = changeVsBaseline === null ? null : m.direction === "up_good" ? changeVsBaseline : -changeVsBaseline;
    const mag = Math.abs(changeVsBaseline ?? 0);
    const inputs = m.formula ? null : daily.get(m.key);
    return {
      metric: m,
      current: cur[m.key],
      prior: prev[m.key],
      baseline,
      changeVsPrior,
      changeVsBaseline,
      signal,
      flag: mag >= 0.5 ? "alert" : mag >= 0.25 ? "watch" : "none",
      series: perDay.map((d) => ({ date: d.date, value: d.values[m.key] })),
      dataDays: inputs ? thisWeek.filter((d) => inputs.has(d)).length : thisWeek.filter((_, i) => perDay[perDay.length - WEEK + i].values[m.key] !== null).length,
    };
  });

  return { asOf: to, periodStart: thisWeek[0], metrics: result };
}

