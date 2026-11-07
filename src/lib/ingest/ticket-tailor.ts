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

export interface TtEvent {
  id: string;
  name?: string | null;
  status?: string | null;
  private?: string | boolean | null;
  hidden?: string | boolean | null;
  start?: { unix?: number | null; date?: string | null } | null;
  max_tickets_sold_per_occurrence?: number | null;
  ticket_types?: { price?: number | null; quantity_issued?: number | null; quantity_total?: number | null }[] | null;
}

/** Courses are scheduled months ahead, so 60 days would often show nothing (SCM-311, 7 Nov 2026). */
export const FILL_RATE_HORIZON_DAYS = 180;

const isYes = (v: string | boolean | null | undefined) => v === true || v === "true";

/**
 * Seats sold / capacity for upcoming public paid courses: a daily snapshot, overall and per course
 * (course:<name> <date>). Capacity is the event's ticket cap if it has one, otherwise the ticket
 * types added up. Free events are left out, they're sign-ups rather than seats. With no upcoming
 * course nothing is stored, because 0% would read as a course that isn't selling.
 */
export function fillRateSnapshot(events: TtEvent[], day: string, nowUnix: number): Observation[] {
  const until = nowUnix + FILL_RATE_HORIZON_DAYS * 86_400;
  const courses = events.flatMap((e) => {
    const start = e.start?.unix ?? 0;
    const types = e.ticket_types ?? [];
    if (start < nowUnix || start >= until || e.status !== "published" || isYes(e.private) || isYes(e.hidden)) return [];
    if (!types.some((t) => (t.price ?? 0) > 0)) return [];
    const capacity = e.max_tickets_sold_per_occurrence || types.reduce((sum, t) => sum + (t.quantity_total ?? 0), 0);
    if (capacity <= 0) return [];
    return [{ label: `${(e.name ?? e.id).trim().toLowerCase()} ${e.start?.date ?? ""}`.trim(), capacity, sold: types.reduce((sum, t) => sum + (t.quantity_issued ?? 0), 0) }];
  });
  if (!courses.length) return [];
  const metric_key = "ticket_tailor.fill_rate";
  const total = (key: "sold" | "capacity") => courses.reduce((sum, c) => sum + c[key], 0);
  return [
    { metric_key, date: day, dimension: "", value: total("sold") / total("capacity") },
    ...courses.map((c) => ({ metric_key, date: day, dimension: `course:${c.label}`, value: c.sold / c.capacity })),
  ];
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
