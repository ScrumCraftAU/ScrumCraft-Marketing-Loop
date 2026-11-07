import "server-only";
import { env, isTicketTailorConfigured } from "@/lib/env";
import { adelaideDay, adelaideMidnight, lastDays } from "./days";
import { FILL_RATE_HORIZON_DAYS, fillRateSnapshot, ordersToObservations, type TtEvent, type TtOrder } from "./ticket-tailor";
import { defaultDayCount, recordPullError, storePull } from "./store";

const API = "https://api.tickettailor.com/v1";
const MAX_PAGES = 50; // 100 orders a page; far above our volume, but bounded

async function tt<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`${env.ticketTailorApiKey}:`).toString("base64")}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Ticket Tailor ${res.status} on ${url.replace(API, "").split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/**
 * Pulls Ticket Tailor orders created in the last `dayCount` Adelaide days (to yesterday) and
 * stores daily bookings, seats, revenue and free sign-ups.
 */
export async function pullTicketTailor(dayCount?: number): Promise<{ ok: boolean; stored: number; days: number; orders: number; warnings: string[]; error?: string }> {
  if (!isTicketTailorConfigured()) return { ok: false, stored: 0, days: 0, orders: 0, warnings: [], error: "TICKET_TAILOR_API_KEY is not set" };
  const days = lastDays(dayCount ?? (await defaultDayCount("ticket_tailor")));
  const from = Math.floor(adelaideMidnight(days[0]) / 1000);
  const to = Math.floor(adelaideMidnight(adelaideDay(adelaideMidnight(days[days.length - 1]) + 36 * 3_600_000)!) / 1000);
  const warnings: string[] = [];
  const raw: Record<string, unknown> = { days: [days[0], days[days.length - 1]] };

  try {
    const orders: TtOrder[] = [];
    let next: string | null = `/orders?${new URLSearchParams({ "created_at.gte": String(from), "created_at.lt": String(to), limit: "100" })}`;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const res: { data: TtOrder[]; links?: { next?: string | null } } = await tt(next);
      orders.push(...res.data);
      next = res.links?.next ? `${API}${res.links.next.replace(/^\/v1/, "")}` : null;
    }
    if (next) warnings.push(`stopped after ${MAX_PAGES} pages of orders`);
    // The API filter should already bound the window; drop anything outside it to be safe.
    const inWindow = orders.filter((o) => o.created_at >= from && o.created_at < to);
    raw.orders = inWindow.map((o) => ({ id: o.id, created_at: o.created_at, status: o.status, total: o.total, refund: o.refund_amount ?? 0, tickets: (o.issued_tickets ?? []).length }));

    const parsed = ordersToObservations(inWindow, days);
    warnings.push(...parsed.warnings);
    const observations = [...parsed.observations];

    // Keep the order numbers even if the events call fails.
    try {
      const now = Math.floor(Date.now() / 1000);
      const events: TtEvent[] = [];
      let nextEvents: string | null = `/events?${new URLSearchParams({ "start_at.gte": String(now), "start_at.lt": String(now + FILL_RATE_HORIZON_DAYS * 86_400), limit: "100" })}`;
      for (let page = 0; nextEvents && page < MAX_PAGES; page++) {
        const res: { data: TtEvent[]; links?: { next?: string | null } } = await tt(nextEvents);
        events.push(...res.data);
        nextEvents = res.links?.next ? `${API}${res.links.next.replace(/^\/v1/, "")}` : null;
      }
      const fill = fillRateSnapshot(events, days[days.length - 1], now);
      raw.fill_rate = { events: events.length, courses: Math.max(fill.length - 1, 0) };
      observations.push(...fill);
    } catch (err) {
      warnings.push(`course fill rate: ${err instanceof Error ? err.message : String(err)}`);
    }

    const stored = await storePull("ticket_tailor", observations, raw, warnings);
    return { ok: true, stored, days: days.length, orders: inWindow.length, warnings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordPullError("ticket_tailor", raw, warnings, error);
    return { ok: false, stored: 0, days: days.length, orders: 0, warnings, error };
  }
}
