import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentsToObservations, type LwPayment } from "./learnworlds.ts";

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

test("Academy sales and revenue per Adelaide day and course", () => {
  const days = ["2026-10-12", "2026-10-13"];
  const course = (name: string) => ({ id: name.toLowerCase().replace(/\s+/g, "-"), type: "course", name });
  const payments: LwPayment[] = [
    // 12 Oct 10am Adelaide: AI Agile Practitioner, $299
    { id: "p1", transaction_id: "ch_1", type: "one-off", product: course("AI Agile Practitioner"), price: 299, paid_at: unix("2026-10-11T23:30:00Z"), created: unix("2026-10-11T23:30:00Z") },
    // 13 Oct Adelaide (14:00 UTC on the 12th): same course, $299
    { id: "p2", transaction_id: "ch_2", type: "one-off", product: course("AI Agile Practitioner"), price: 299, paid_at: unix("2026-10-12T14:00:00Z"), created: unix("2026-10-12T14:00:00Z") },
    // 13 Oct: another course, $99
    { id: "p3", transaction_id: "ch_3", type: "one-off", product: course("Scrum Basics"), price: 99, paid_at: unix("2026-10-13T01:00:00Z"), created: unix("2026-10-13T01:00:00Z") },
    // admin enrolment, refunded payment and a free enrolment: all left out
    { id: "p4", transaction_id: "Added by admin", type: "one-off", product: course("Scrum Basics"), price: 1250, paid_at: unix("2026-10-13T02:00:00Z"), created: unix("2026-10-13T02:00:00Z") },
    { id: "p5", transaction_id: "ch_5", type: "one-off", product: course("Scrum Basics"), price: 99, refund_at: unix("2026-10-13T05:00:00Z"), paid_at: unix("2026-10-13T03:00:00Z"), created: unix("2026-10-13T03:00:00Z") },
    { id: "p6", transaction_id: "ch_6", type: "one-off", product: course("Scrum Basics"), price: 0, paid_at: null, created: unix("2026-10-13T04:00:00Z") },
    // team-member test payment (EXCLUDED_PAYMENTS)
    { id: "69fd46351d9e9f35130707b3", transaction_id: "ch_8", type: "one-off", product: course("How to Write Great Product Goals"), price: 1.1, paid_at: unix("2026-10-13T06:00:00Z"), created: unix("2026-10-13T06:00:00Z") },
    // outside the window
    { id: "p7", transaction_id: "ch_7", type: "one-off", product: course("Scrum Basics"), price: 99, paid_at: unix("2026-09-01T04:00:00Z"), created: unix("2026-09-01T04:00:00Z") },
  ];
  const { observations, skipped } = paymentsToObservations(payments, days);
  const v = (k: string, d: string, dim = "") => observations.find((o) => o.metric_key === k && o.date === d && o.dimension === dim)?.value;
  assert.deepEqual(skipped, { admin: 1, refunded: 1, free: 1, excluded: 1 });
  assert.equal(v("learnworlds.sales", "2026-10-12"), 1);
  assert.equal(v("learnworlds.revenue", "2026-10-12"), 299);
  assert.equal(v("learnworlds.sales", "2026-10-13"), 2);
  assert.equal(v("learnworlds.revenue", "2026-10-13"), 398);
  assert.equal(v("learnworlds.revenue", "2026-10-13", "course:ai agile practitioner"), 299);
  assert.equal(v("learnworlds.sales", "2026-10-13", "course:scrum basics"), 1);
});
