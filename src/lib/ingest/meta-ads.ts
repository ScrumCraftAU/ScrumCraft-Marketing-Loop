/**
 * Meta Marketing API insights → daily metric observations (SCM-174). Pure helpers, kept
 * dependency-free for `node --test`; the API calls live in meta-ads-pull.ts.
 *
 * Counting rules:
 *   - spend, impressions and clicks are Ads Manager's own numbers per day (clicks = all clicks)
 *   - reach is per day. People reached can't be added across days, so its aggregation is "avg"
 *   - conversions are Meta's "lead" actions, which needs the pixel (SCM-173), so 0 until that's done
 * The platform breakdown is stored as channel:<facebook | instagram | ...>.
 */
import type { Observation } from "./ga4.ts";

export interface MetaInsightRow {
  date_start: string;
  spend?: string | null;
  impressions?: string | null;
  reach?: string | null;
  clicks?: string | null;
  actions?: { action_type: string; value: string }[] | null;
  publisher_platform?: string | null;
}

const num = (v: string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** "lead" already adds up the lead types below it, so the others only count when it's missing. */
export function leadsFrom(actions: MetaInsightRow["actions"]) {
  const value = (type: string) => actions?.find((a) => a.action_type === type)?.value;
  if (value("lead") !== undefined) return num(value("lead"));
  return num(value("offsite_conversion.fb_pixel_lead")) + num(value("onsite_conversion.lead_grouped"));
}

const FIELDS = {
  "meta_ads.spend": (r: MetaInsightRow) => num(r.spend),
  "meta_ads.impressions": (r: MetaInsightRow) => num(r.impressions),
  "meta_ads.reach": (r: MetaInsightRow) => num(r.reach),
  "meta_ads.clicks": (r: MetaInsightRow) => num(r.clicks),
  "meta_ads.conversions": (r: MetaInsightRow) => leadsFrom(r.actions),
};

/** Totals for every day in `days`, zero-filled, plus a row per platform where it has a value. */
export function insightsToObservations(rows: MetaInsightRow[], platformRows: MetaInsightRow[], days: string[]): Observation[] {
  const inWindow = new Set(days);
  const out = new Map<string, Observation>();
  const add = (metric_key: string, date: string, dimension: string, value: number) => {
    const k = `${metric_key}\u0000${date}\u0000${dimension}`;
    const cur = out.get(k);
    if (cur) cur.value += value;
    else out.set(k, { metric_key, date, dimension, value });
  };
  for (const metric_key of Object.keys(FIELDS)) for (const day of days) add(metric_key, day, "", 0);
  for (const r of rows) {
    if (!inWindow.has(r.date_start)) continue;
    for (const [metric_key, read] of Object.entries(FIELDS)) add(metric_key, r.date_start, "", read(r));
  }
  for (const r of platformRows) {
    if (!inWindow.has(r.date_start) || !r.publisher_platform) continue;
    for (const [metric_key, read] of Object.entries(FIELDS)) {
      const value = read(r);
      if (value) add(metric_key, r.date_start, `channel:${r.publisher_platform.toLowerCase()}`, value);
    }
  }
  return [...out.values()];
}
