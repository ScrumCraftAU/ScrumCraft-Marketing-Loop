/**
 * Ticket Tailor orders → daily metric observations (SCM-169). Pure helpers, kept
 * dependency-free for `node --test`; the API calls live in ticket-tailor-pull.ts.
 *
 * Counting rules (Ticket Tailor is the source of truth for bookings):
 *   - bookings  = paid orders (total > 0) that are completed or pending (pending = bank
 *                 transfer not yet received); cancelled and refunded orders don't count
 *   - seats     = valid issued event tickets on those orders
 *   - revenue   = order total less refunds, AUD incl. GST (Ticket Tailor's own total)
 *   - free sign-ups = $0 completed orders (e.g. the free Registered Scrum Basics), a lead
 *                 signal kept apart from bookings
 * Each order counts on the Adelaide day it was created.
 */
import type { Observation } from "./ga4.ts";
import { adelaideDay } from "./days.ts";

export interface TtOrder {
  id: string;
  created_at: number; // unix seconds
  status: string;
  total: number; // minor units (cents)
  refund_amount?: number | null;
  currency?: { base_multiplier?: number; code?: string } | null;
  issued_tickets?: { status?: string }[] | null;
}

const COUNTED = new Set(["completed", "pending"]);

export function ordersToObservations(orders: TtOrder[], days: string[]): { observations: Observation[]; warnings: string[] } {
  const warnings: string[] = [];
  const zero = () => new Map(days.map((d) => [d, 0]));
  const bookings = zero(), seats = zero(), revenue = zero(), free = zero();

  for (const o of orders) {
    const day = adelaideDay(o.created_at * 1000);
    if (!day || !bookings.has(day) || !COUNTED.has(o.status)) continue;
    const multiplier = o.currency?.base_multiplier || 100;
    if (o.currency?.code && o.currency.code.toLowerCase() !== "aud") warnings.push(`order ${o.id} is in ${o.currency.code}, counted as AUD`);
    const net = (o.total - (o.refund_amount ?? 0)) / multiplier;
    if (o.total > 0) {
      bookings.set(day, bookings.get(day)! + 1);
      revenue.set(day, revenue.get(day)! + net);
      seats.set(day, seats.get(day)! + (o.issued_tickets ?? []).filter((t) => (t.status ?? "valid") === "valid").length);
    } else if (o.status === "completed") {
      free.set(day, free.get(day)! + 1);
    }
  }

  const rows = (key: string, m: Map<string, number>) => [...m].map(([date, value]) => ({ metric_key: key, date, dimension: "", value }));
  return {
    observations: [
      ...rows("ticket_tailor.orders", bookings),
      ...rows("ticket_tailor.tickets", seats),
      ...rows("ticket_tailor.revenue", revenue),
      ...rows("ticket_tailor.free_signups", free),
    ],
    warnings: [...new Set(warnings)],
  };
}
