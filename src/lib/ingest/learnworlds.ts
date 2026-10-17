/**
 * LearnWorlds (ScrumCraft Academy) payments → daily metric observations. Pure helpers, kept
 * dependency-free for `node --test`; the API calls live in learnworlds-pull.ts.
 *
 * Counting rules (LearnWorlds is the source of truth for Academy sales):
 *   - a sale    = a payment with a price above 0 that has been paid and not refunded
 *   - revenue   = the payment's price (AUD, as LearnWorlds reports it)
 *   - "Added by admin" payments are manual enrolments (often invoiced and already a HubSpot
 *     deal), so they are left out to avoid counting the same money twice
 * Each payment counts on the Adelaide day it was paid (created, if no paid date).
 */
import type { Observation } from "./ga4.ts";
import { adelaideDay } from "./days.ts";

export interface LwPayment {
  id: string;
  transaction_id?: string | null;
  type?: string | null;
  product?: { id?: string | null; type?: string | null; name?: string | null } | null;
  price?: number | null;
  refund_at?: number | null; // unix seconds
  paid_at?: number | null; // unix seconds
  created: number; // unix seconds
}

const isAdminAdded = (p: LwPayment) => (p.transaction_id ?? "").trim().toLowerCase() === "added by admin";

export function paymentsToObservations(payments: LwPayment[], days: string[]): { observations: Observation[]; skipped: { admin: number; refunded: number; free: number } } {
  const zero = () => new Map(days.map((d) => [d, 0]));
  const sales = zero(), revenue = zero();
  const byCourse = new Map<string, Observation>();
  const skipped = { admin: 0, refunded: 0, free: 0 };

  for (const p of payments) {
    const day = adelaideDay((p.paid_at ?? p.created) * 1000);
    if (!day || !sales.has(day)) continue;
    const price = Number(p.price ?? 0);
    if (isAdminAdded(p)) { skipped.admin++; continue; }
    if (p.refund_at) { skipped.refunded++; continue; }
    if (!Number.isFinite(price) || price <= 0) { skipped.free++; continue; }
    sales.set(day, sales.get(day)! + 1);
    revenue.set(day, revenue.get(day)! + price);
    const dimension = `course:${(p.product?.name ?? p.product?.id ?? "unknown").trim().toLowerCase() || "unknown"}`;
    for (const [metric_key, value] of [["learnworlds.sales", 1], ["learnworlds.revenue", price]] as const) {
      const k = `${metric_key}\u0000${day}\u0000${dimension}`;
      const cur = byCourse.get(k);
      if (cur) cur.value += value;
      else byCourse.set(k, { metric_key, date: day, dimension, value });
    }
  }

  const rows = (key: string, m: Map<string, number>) => [...m].map(([date, value]) => ({ metric_key: key, date, dimension: "", value }));
  return { observations: [...rows("learnworlds.sales", sales), ...rows("learnworlds.revenue", revenue), ...byCourse.values()], skipped };
}
