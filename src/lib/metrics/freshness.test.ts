import { test } from "node:test";
import assert from "node:assert/strict";
import { isOnline } from "./freshness.ts";

const latest = new Map([
  ["ga4.sessions", "2026-10-13"],
  ["ga4.checkout_views", "2026-10-13"],
  ["ga4.booking_checkout_views", "2026-10-13"],
  ["hubspot.email_clicks", "2026-10-13"],
  ["hubspot.emails_delivered", "2026-10-13"],
  ["seo.avg_position", "2026-09-01"],
]);

test("stored metrics are online with data in the last 7 days", () => {
  assert.equal(isOnline({ key: "ga4.sessions", formula: null }, latest, "2026-10-14"), true);
  assert.equal(isOnline({ key: "seo.avg_position", formula: null }, latest, "2026-10-14"), false);
  assert.equal(isOnline({ key: "ticket_tailor.orders", formula: null }, latest, "2026-10-14"), false);
});

test("derived metrics need every input online, following derived inputs", () => {
  const formulas = new Map<string, string | null>([["checkout.views", "ga4.checkout_views + ga4.booking_checkout_views"]]);
  assert.equal(isOnline({ key: "hubspot.email_click_rate", formula: "hubspot.email_clicks / hubspot.emails_delivered" }, latest, "2026-10-14"), true);
  assert.equal(isOnline({ key: "marketing.revenue", formula: "ticket_tailor.revenue + hubspot.email_clicks" }, latest, "2026-10-14"), false);
  // checkout.conversion depends on a derived metric whose inputs are both online, plus Ticket Tailor
  assert.equal(isOnline({ key: "x.views", formula: "checkout.views * 1" }, latest, "2026-10-14", formulas), true);
  assert.equal(isOnline({ key: "checkout.conversion", formula: "ticket_tailor.orders / checkout.views" }, latest, "2026-10-14", formulas), false);
  latest.set("ticket_tailor.orders", "2026-10-13");
  assert.equal(isOnline({ key: "checkout.conversion", formula: "ticket_tailor.orders / checkout.views" }, latest, "2026-10-14", formulas), true);
});
