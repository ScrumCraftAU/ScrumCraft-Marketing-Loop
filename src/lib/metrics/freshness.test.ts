import { test } from "node:test";
import assert from "node:assert/strict";
import { formulaInputs, isOnline } from "./freshness.ts";

const latest = new Map([
  ["ga4.sessions", "2026-10-13"],
  ["hubspot.email_clicks", "2026-10-13"],
  ["hubspot.emails_delivered", "2026-10-13"],
  ["seo.avg_position", "2026-09-01"],
]);

test("stored metrics are online with data in the last 7 days", () => {
  assert.equal(isOnline({ key: "ga4.sessions", formula: null }, latest, "2026-10-14"), true);
  assert.equal(isOnline({ key: "seo.avg_position", formula: null }, latest, "2026-10-14"), false);
  assert.equal(isOnline({ key: "ticket_tailor.orders", formula: null }, latest, "2026-10-14"), false);
});

test("derived metrics need every input online", () => {
  assert.deepEqual(formulaInputs("(linkedin_ads.clicks + meta_ads.clicks) / ga4.sessions"), ["linkedin_ads.clicks", "meta_ads.clicks", "ga4.sessions"]);
  assert.equal(isOnline({ key: "hubspot.email_click_rate", formula: "hubspot.email_clicks / hubspot.emails_delivered" }, latest, "2026-10-14"), true);
  assert.equal(isOnline({ key: "marketing.revenue", formula: "ticket_tailor.revenue + hubspot.email_clicks" }, latest, "2026-10-14"), false);
});
