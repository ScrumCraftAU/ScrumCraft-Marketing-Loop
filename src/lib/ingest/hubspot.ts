/**
 * HubSpot → daily metric observations (SCM-167). Pure helpers, kept dependency-free so they
 * can be unit-tested with plain `node --test`; the API calls live in hubspot-pull.ts.
 *
 * Days are Adelaide calendar days, matching the main-site GA4 property (552676870).
 */
import type { Observation } from "./ga4.ts";

export const TIME_ZONE = "Australia/Adelaide";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** yyyy-mm-dd of an instant, in Adelaide time. Accepts ISO strings or epoch ms (as number or string). */
export function adelaideDay(instant: string | number | Date): string | null {
  const d = instant instanceof Date ? instant : new Date(typeof instant === "string" && /^\d+$/.test(instant) ? Number(instant) : instant);
  return Number.isNaN(d.getTime()) ? null : dayFormat.format(d);
}

/** Epoch ms of 00:00 Adelaide time on `day` (yyyy-mm-dd), daylight saving included. */
export function adelaideMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offsetAt = (ms: number) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
  };
  // Re-check the offset at the computed instant in case the guess straddles a DST change.
  const first = guess - offsetAt(guess) * 60_000;
  return guess - offsetAt(first) * 60_000;
}

/** The last `count` Adelaide days ending yesterday, oldest first. */
export function lastDays(count: number, now = new Date()): string[] {
  const today = adelaideDay(now)!;
  const days: string[] = [];
  let ms = adelaideMidnight(today);
  for (let i = 0; i < count; i++) {
    ms -= 12 * 3_600_000; // step back into the previous day, then snap to its midnight
    const day = adelaideDay(ms)!;
    ms = adelaideMidnight(day);
    days.unshift(day);
  }
  return days;
}

/** Counts records per Adelaide day of `dateProp`, only for `days`, with zero-filled gaps. */
export function countByDay(records: { properties: Record<string, string | null | undefined> }[], dateProp: string, days: string[], metric_key: string): Observation[] {
  const counts = new Map(days.map((d) => [d, 0]));
  for (const r of records) {
    const day = r.properties[dateProp] ? adelaideDay(r.properties[dateProp]!) : null;
    if (day && counts.has(day)) counts.set(day, counts.get(day)! + 1);
  }
  return [...counts].map(([date, value]) => ({ metric_key, date, dimension: "", value }));
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
