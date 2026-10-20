/**
 * HubSpot → daily metric observations (SCM-167). Pure helpers, kept dependency-free so they
 * can be unit-tested with plain `node --test`; the API calls live in hubspot-pull.ts.
 *
 * Days are Adelaide calendar days, matching the main-site GA4 property (552676870).
 */
import type { Observation } from "./ga4.ts";

export { TIME_ZONE, adelaideDay, adelaideMidnight, lastDays } from "./days.ts";
import { adelaideDay } from "./days.ts";

/**
 * HubSpot deals left out of every deal metric. Academy (LearnWorlds) course sales are counted from
 * LearnWorlds (learnworlds.revenue, agreed 18 Oct 2026); these deals were added by hand for such
 * sales before that and would count the same money twice. No new deals are added for course sales.
 */
export const EXCLUDED_DEALS: Record<string, string> = {
  "49779082773": "Julie Williams - YOMP - RSMPO, $324.50 LearnWorlds sale 22 Nov 2025",
  "60070268588": "Christine Kumar Self Paced RSMPO, $595 LearnWorlds sale 7 May 2026",
};

export const withoutExcludedDeals = <T extends { id: string }>(deals: T[]) => deals.filter((d) => !(String(d.id) in EXCLUDED_DEALS));

/** Counts records per Adelaide day of `dateProp`, only for `days`, with zero-filled gaps. */
export function countByDay(records: { properties: Record<string, string | null | undefined> }[], dateProp: string, days: string[], metric_key: string): Observation[] {
  const counts = new Map(days.map((d) => [d, 0]));
  for (const r of records) {
    const day = r.properties[dateProp] ? adelaideDay(r.properties[dateProp]!) : null;
    if (day && counts.has(day)) counts.set(day, counts.get(day)! + 1);
  }
  return [...counts].map(([date, value]) => ({ metric_key, date, dimension: "", value }));
}

/**
 * Counts records per Adelaide day of `dateProp` and per value of `dimProp`, stored under dimension
 * `<prefix>:<value>` (lower-cased). Only non-zero days are returned; the total comes from countByDay.
 */
export function countByDayAndDimension(records: { properties: Record<string, string | null | undefined> }[], dateProp: string, dimProp: string, days: string[], metric_key: string, prefix: string): Observation[] {
  const wanted = new Set(days);
  const counts = new Map<string, Observation>();
  for (const r of records) {
    const day = r.properties[dateProp] ? adelaideDay(r.properties[dateProp]!) : null;
    if (!day || !wanted.has(day)) continue;
    const dimension = `${prefix}:${(r.properties[dimProp] ?? "unknown").trim().toLowerCase() || "unknown"}`;
    const k = `${day}\u0000${dimension}`;
    const cur = counts.get(k);
    if (cur) cur.value += 1;
    else counts.set(k, { metric_key, date: day, dimension, value: 1 });
  }
  return [...counts.values()];
}

/** Like countByDayAndDimension, but sums a numeric property (for example won revenue by deal source). */
export function sumByDayAndDimension(records: { properties: Record<string, string | null | undefined> }[], dateProp: string, valueProp: string, dimProp: string, days: string[], metric_key: string, prefix: string): Observation[] {
  const wanted = new Set(days);
  const sums = new Map<string, Observation>();
  for (const r of records) {
    const day = r.properties[dateProp] ? adelaideDay(r.properties[dateProp]!) : null;
    const v = Number(r.properties[valueProp] ?? 0);
    if (!day || !wanted.has(day) || !Number.isFinite(v)) continue;
    const dimension = `${prefix}:${(r.properties[dimProp] ?? "unknown").trim().toLowerCase() || "unknown"}`;
    const k = `${day}\u0000${dimension}`;
    const cur = sums.get(k);
    if (cur) cur.value += v;
    else sums.set(k, { metric_key, date: day, dimension, value: v });
  }
  return [...sums.values()];
}

/**
 * Open pipeline on `day` (a snapshot, not a daily flow): deal count, total amount and the
 * probability-weighted amount (HubSpot "Weighted amount": amount x deal-stage probability), overall
 * and by deal source. Stored with aggregation "last".
 */
export function pipelineSnapshot(openDeals: { properties: Record<string, string | null | undefined> }[], day: string): Observation[] {
  const totals = new Map<string, Observation>();
  const add = (metric_key: string, dimension: string, value: number) => {
    if (!Number.isFinite(value)) return;
    const k = `${metric_key}\u0000${dimension}`;
    const cur = totals.get(k);
    if (cur) cur.value += value;
    else totals.set(k, { metric_key, date: day, dimension, value });
  };
  for (const key of ["hubspot.open_deals", "hubspot.open_pipeline_value", "hubspot.weighted_pipeline_value"]) add(key, "", 0);
  for (const d of openDeals) {
    const source = `source:${(d.properties.deal_source ?? "unknown").trim().toLowerCase() || "unknown"}`;
    const amount = Number(d.properties.amount_in_home_currency ?? 0);
    const weighted = Number(d.properties.hs_projected_amount_in_home_currency ?? 0);
    for (const dim of ["", source]) {
      add("hubspot.open_deals", dim, 1);
      add("hubspot.open_pipeline_value", dim, amount);
      add("hubspot.weighted_pipeline_value", dim, weighted);
    }
  }
  return [...totals.values()];
}

/** Sums a numeric property per Adelaide day of `dateProp`, only for `days`, with zero-filled gaps. */
export function sumByDay(records: { properties: Record<string, string | null | undefined> }[], dateProp: string, valueProp: string, days: string[], metric_key: string): Observation[] {
  const sums = new Map(days.map((d) => [d, 0]));
  for (const r of records) {
    const day = r.properties[dateProp] ? adelaideDay(r.properties[dateProp]!) : null;
    const v = Number(r.properties[valueProp] ?? 0);
    if (day && sums.has(day) && Number.isFinite(v)) sums.set(day, sums.get(day)! + v);
  }
  return [...sums].map(([date, value]) => ({ metric_key, date, dimension: "", value }));
}

/** Marketing-email counters we keep, mapped to metric keys. */
export const EMAIL_COUNTERS: Record<string, string> = {
  sent: "hubspot.emails_sent",
  delivered: "hubspot.emails_delivered",
  open: "hubspot.email_opens",
  click: "hubspot.email_clicks",
};

interface HistogramBucket {
  interval?: { start?: string; end?: string };
  aggregations?: { counters?: Record<string, number> };
}

/**
 * Parses /marketing/v3/emails/statistics/histogram (interval=DAY). Each bucket's start is a
 * UTC instant; it is attributed to the Adelaide day it falls in.
 */
export function parseEmailHistogram(payload: unknown, days: string[]): { observations: Observation[]; warnings: string[] } {
  const results = (payload as { results?: HistogramBucket[] })?.results;
  if (!Array.isArray(results)) return { observations: [], warnings: ["email histogram: no results array"] };
  const wanted = new Set(days);
  const sums = new Map<string, number>();
  for (const b of results) {
    const day = b.interval?.start ? adelaideDay(b.interval.start) : null;
    if (!day || !wanted.has(day)) continue;
    for (const [counter, key] of Object.entries(EMAIL_COUNTERS)) {
      const v = Number(b.aggregations?.counters?.[counter] ?? 0);
      const k = `${key}\u0000${day}`;
      sums.set(k, (sums.get(k) ?? 0) + (Number.isFinite(v) ? v : 0));
    }
  }
  // Zero-fill: HubSpot omits days with no email activity.
  for (const day of days) for (const key of Object.values(EMAIL_COUNTERS)) if (!sums.has(`${key}\u0000${day}`)) sums.set(`${key}\u0000${day}`, 0);
  const observations = [...sums].map(([k, value]) => {
    const [metric_key, date] = k.split("\u0000");
    return { metric_key, date, dimension: "", value };
  });
  return { observations, warnings: [] };
}

/** A marketing email from GET /marketing/v3/emails. */
export interface MarketingEmail {
  id: string;
  name?: string | null;
  type?: string | null; // BATCH_EMAIL, AUTOMATED_EMAIL, …
  publishDate?: string | null;
}

/**
 * Emails that can have sends in the window: batch emails published from `fromIso` on, and every
 * automated (workflow) email, which keeps sending long after it was published.
 */
export function emailsToBreakDown(emails: MarketingEmail[], fromIso: string): MarketingEmail[] {
  return emails.filter((e) => /AUTOMATED/i.test(e.type ?? "") || (e.publishDate != null && e.publishDate >= fromIso));
}

/** One email's daily histogram as `email:<name>` observations (non-zero days only). */
export function emailObservations(histogram: unknown, days: string[], email: MarketingEmail): Observation[] {
  const label = (email.name ?? `email ${email.id}`).trim().toLowerCase() || `email ${email.id}`;
  return parseEmailHistogram(histogram, days).observations.filter((o) => o.value !== 0).map((o) => ({ ...o, dimension: `email:${label}` }));
}

/**
 * Guard against the per-email filter being ignored by the API: per-email sends can't add up to
 * more than the daily total. Returns a warning (and the breakdown should be dropped) if they do.
 */
export function checkEmailBreakdown(perEmail: Observation[], totals: Observation[]): string | null {
  const sum = (obs: Observation[]) => obs.filter((o) => o.metric_key === "hubspot.emails_sent").reduce((a, o) => a + o.value, 0);
  const total = sum(totals), parts = sum(perEmail);
  return parts > total * 1.02 + 1 ? `per-email sends (${parts}) exceed the daily total (${total}); breakdown dropped` : null;
}
