import { test } from "node:test";
import assert from "node:assert/strict";
import { fillRateSnapshot, ordersToObservations, type TtEvent, type TtOrder } from "./ticket-tailor.ts";

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const aud = { base_multiplier: 100, code: "aud" };

test("course fill rate covers upcoming public paid courses, overall and per course", () => {
  const now = unix("2026-11-07T00:00:00Z");
  const paid = (quantity_total: number, quantity_issued: number) => ({ price: 150000, quantity_total, quantity_issued });
  const course = (over: Partial<TtEvent>): TtEvent => ({ id: "ev", name: "RSM", status: "published", private: "false", hidden: "false", start: { unix: unix("2027-03-04T00:00:00Z"), date: "2027-03-04" }, max_tickets_sold_per_occurrence: null, ticket_types: [paid(10, 0), paid(2, 1)], ...over });
  const events = [
    course({ id: "ev_1" }), // 1 of 12, counting every ticket type
    course({ id: "ev_2", name: "RPO", start: { unix: unix("2027-04-01T00:00:00Z"), date: "2027-04-01" }, max_tickets_sold_per_occurrence: 4, ticket_types: [paid(10, 3)] }), // the cap wins, 3 of 4
    // All left out: past, too far ahead, draft, private, hidden and free.
    course({ start: { unix: unix("2026-11-01T00:00:00Z") } }),
    course({ start: { unix: unix("2027-10-01T00:00:00Z") } }),
    course({ status: "draft" }),
    course({ private: "true" }),
    course({ hidden: "true" }),
    course({ ticket_types: [{ price: 0, quantity_total: 100, quantity_issued: 50 }] }),
  ];
  const obs = fillRateSnapshot(events, "2026-11-06", now);
  const v = (dim: string) => obs.find((o) => o.dimension === dim)?.value;
  assert.equal(obs.length, 3);
  assert.equal(obs[0].metric_key, "ticket_tailor.fill_rate");
  assert.equal(obs[0].date, "2026-11-06");
  assert.equal(v(""), 4 / 16);
  assert.equal(v("course:rsm 2027-03-04"), 1 / 12);
  assert.equal(v("course:rpo 2027-04-01"), 3 / 4);
  assert.deepEqual(fillRateSnapshot([], "2026-11-06", now), []); // nothing upcoming stores nothing, not 0%
});

test("bookings, seats, revenue and free sign-ups per Adelaide day", () => {
  const days = ["2026-05-12", "2026-05-13"];
  const orders: TtOrder[] = [
    // 12 May 9:19am Adelaide: one Scrum@Scale seat, $1,500
    { id: "or_1", created_at: unix("2026-05-11T23:49:09Z"), status: "completed", total: 150000, currency: aud, issued_tickets: [{ status: "valid" }] },
    // 12 May: certification package (store product, no ticket), $199
    { id: "or_2", created_at: unix("2026-05-12T03:00:00Z"), status: "completed", total: 19900, currency: aud, issued_tickets: null },
    // 13 May Adelaide (14:40 UTC on the 12th): bank transfer not yet paid, partly refunded
    { id: "or_3", created_at: unix("2026-05-12T14:40:00Z"), status: "pending", total: 22500, refund_amount: 2500, currency: aud, issued_tickets: [{ status: "valid" }, { status: "voided" }] },
    // 13 May: free Registered Scrum Basics sign-up
    { id: "or_4", created_at: unix("2026-05-13T01:00:00Z"), status: "completed", total: 0, currency: aud },
    // cancelled test order: ignored
    { id: "or_5", created_at: unix("2026-05-13T02:00:00Z"), status: "cancelled", total: 0, currency: aud },
    // outside the window: ignored
    { id: "or_6", created_at: unix("2026-04-01T02:00:00Z"), status: "completed", total: 19900, currency: aud },
  ];
  const { observations, warnings } = ordersToObservations(orders, days);
  const v = (k: string, d: string) => observations.find((o) => o.metric_key === k && o.date === d)?.value;
  assert.deepEqual(warnings, []);
  assert.equal(v("ticket_tailor.orders", "2026-05-12"), 2);
  assert.equal(v("ticket_tailor.revenue", "2026-05-12"), 1699);
  assert.equal(v("ticket_tailor.tickets", "2026-05-12"), 1);
  assert.equal(v("ticket_tailor.orders", "2026-05-13"), 1);
  assert.equal(v("ticket_tailor.revenue", "2026-05-13"), 200);
  assert.equal(v("ticket_tailor.tickets", "2026-05-13"), 1);
  assert.equal(v("ticket_tailor.free_signups", "2026-05-13"), 1);
  assert.equal(v("ticket_tailor.free_signups", "2026-05-12"), 0);
  assert.equal(observations.length, 8);
});
