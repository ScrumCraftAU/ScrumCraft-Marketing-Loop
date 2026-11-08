/**
 * Monthly delivered-revenue spread (SCM-326). HubSpot `amount` is total contract value, booked in the
 * close month; these helpers spread a deal's value across the months it is delivered, so the monthly
 * view reflects revenue that lands each month rather than a lump at close.
 *
 * Pure and dependency-free (bar the Adelaide-day helper), so it can be unit-tested with `node --test`.
 */
import { adelaideDay } from "./days.ts";

export interface DeliveryProfile {
  revenue_type: "one_off" | "monthly";
  term_months: number;
  /** Delivery start; null = use the deal's close month. */
  start_date: string | null;
}

export interface DeliverableDeal {
  /** AUD value to deliver: a won deal's full contract value, or an open deal's probability-weighted value. */
  amount: number;
  /** HubSpot close date (ISO string); delivery starts in this month unless the profile overrides it. */
  closedate: string | null | undefined;
  /** Null/absent = a one-off delivered in the close month. */
  profile?: DeliveryProfile | null;
}

/** 'YYYY-MM' for an Adelaide date, or null when the date is missing or unparseable. */
export function monthOf(date: string | null | undefined): string | null {
  const day = date ? adelaideDay(date) : null;
  return day ? day.slice(0, 7) : null;
}

/** Adds `n` whole months to a 'YYYY-MM' key (n may be negative). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = ((total % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** `count` consecutive 'YYYY-MM' keys starting at `start` (inclusive). */
export function monthsFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/**
 * Spreads each deal's value across its delivery months and sums per month, keeping only the months in
 * `window` (zero-filled). A one-off deal (or any deal with no monthly profile) lands wholly in its
 * start month; a monthly deal splits its value evenly (amount / term) across `term` consecutive months
 * from its start month. Deals whose whole delivery window falls outside `window` — e.g. a one-off
 * already delivered in a past month — contribute nothing.
 */
export function deliveredByMonth(deals: DeliverableDeal[], window: string[]): Map<string, number> {
  const want = new Set(window);
  const totals = new Map(window.map((m) => [m, 0]));
  for (const deal of deals) {
    const amount = Number(deal.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const monthly = deal.profile?.revenue_type === "monthly";
    const term = monthly ? Math.max(1, Math.round(deal.profile!.term_months)) : 1;
    const startMonth = monthOf(deal.profile?.start_date ?? deal.closedate);
    if (!startMonth) continue;
    const per = amount / term;
    for (let i = 0; i < term; i++) {
      const m = addMonths(startMonth, i);
      if (want.has(m)) totals.set(m, totals.get(m)! + per);
    }
  }
  return totals;
}
