import { test } from "node:test";
import assert from "node:assert/strict";
import { ordersToObservations, type TtOrder } from "./ticket-tailor.ts";

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const aud = { base_multiplier: 100, code: "aud" };

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
