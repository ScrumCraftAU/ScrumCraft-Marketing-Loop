import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, monthsFrom, monthOf, deliveredByMonth, type DeliverableDeal } from "./delivered.ts";

test("addMonths rolls over years both ways", () => {
  assert.equal(addMonths("2026-11", 0), "2026-11");
  assert.equal(addMonths("2026-11", 1), "2026-12");
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-11", 13), "2027-12");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("monthsFrom lists consecutive month keys", () => {
  assert.deepEqual(monthsFrom("2026-11", 3), ["2026-11", "2026-12", "2027-01"]);
});

test("monthOf reads the Adelaide month from an ISO date", () => {
  assert.equal(monthOf("2026-11-30T01:00:00Z"), "2026-11");
  assert.equal(monthOf(null), null);
  assert.equal(monthOf(undefined), null);
});

test("a one-off deal lands wholly in its close month", () => {
  const deals: DeliverableDeal[] = [{ amount: 15000, closedate: "2026-11-16T00:00:00Z" }];
  const window = monthsFrom("2026-11", 12);
  const m = deliveredByMonth(deals, window);
  assert.equal(m.get("2026-11"), 15000);
  assert.equal(m.get("2026-12"), 0);
});

test("a monthly deal splits its value evenly across the term", () => {
  const deals: DeliverableDeal[] = [
    { amount: 120000, closedate: "2026-11-30T00:00:00Z", profile: { revenue_type: "monthly", term_months: 12, start_date: null } },
  ];
  const window = monthsFrom("2026-11", 12);
  const m = deliveredByMonth(deals, window);
  for (const month of window) assert.equal(m.get(month), 10000);
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 120000);
});

test("a profile start_date overrides the close month, and months outside the window are dropped", () => {
  const deals: DeliverableDeal[] = [
    // Started two months before the window: only the months inside the window count.
    { amount: 12000, closedate: "2026-09-01T00:00:00Z", profile: { revenue_type: "monthly", term_months: 12, start_date: "2026-09-01" } },
  ];
  const window = monthsFrom("2026-11", 12); // Nov 2026 → Oct 2027
  const m = deliveredByMonth(deals, window);
  // Delivery runs Sep 2026 → Aug 2027 at 1000/mo; Nov..Aug are inside, Sep/Oct 2027 are not.
  assert.equal(m.get("2026-11"), 1000);
  assert.equal(m.get("2027-08"), 1000);
  assert.equal(m.get("2027-09"), 0);
  assert.equal(m.get("2027-10"), 0);
});

test("a one-off already delivered in a past month contributes nothing to the forward window", () => {
  const deals: DeliverableDeal[] = [{ amount: 50000, closedate: "2026-08-10T00:00:00Z" }];
  const window = monthsFrom("2026-11", 12);
  const m = deliveredByMonth(deals, window);
  assert.equal([...m.values()].reduce((a, b) => a + b, 0), 0);
});

test("weighted open and full won amounts sum per month", () => {
  const deals: DeliverableDeal[] = [
    { amount: 15000, closedate: "2026-11-16T00:00:00Z" }, // won one-off
    { amount: 2000, closedate: "2026-11-30T00:00:00Z" }, // weighted open one-off
  ];
  const m = deliveredByMonth(deals, monthsFrom("2026-11", 3));
  assert.equal(m.get("2026-11"), 17000);
});
