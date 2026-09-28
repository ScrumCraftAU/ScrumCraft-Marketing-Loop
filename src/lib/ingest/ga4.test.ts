import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COURSE_PAGE, CHECKOUT_PAGE, extractReports, findZapierFileLink, parseGa4 } from "./ga4.ts";

// Real batchRunReports output for www.scrumcraft.com (25–26 Sep 2026), as Zapier returns it.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ga4-batch.json", import.meta.url), "utf8"));
const find = (obs: ReturnType<typeof parseGa4>["observations"], key: string, date: string, dimension = "") =>
  obs.find((o) => o.metric_key === key && o.date === date && o.dimension === dimension)?.value;

test("finds reports in every wrapper Zapier might send", () => {
  assert.equal(extractReports(fixture)?.length, 4);
  assert.equal(extractReports(fixture.body)?.length, 4);
  assert.equal(extractReports({ results: [fixture] })?.length, 4);
  assert.equal(extractReports(JSON.stringify(fixture))?.length, 4);
  // Live Zap runs: step 3's "Response Body" (a JSON string), alone or inside a Raw Output object
  const body = JSON.stringify(fixture.body, null, 2);
  assert.equal(extractReports(body)?.length, 4);
  assert.equal(extractReports({ request: { method: "POST" }, response: { status: 200, body } })?.length, 4);
  assert.equal(extractReports({ "Response Body": body })?.length, 4);
  assert.equal(extractReports({ nope: true }), null);
  assert.equal(extractReports(""), null);
});

test("main site totals, channels, pages and events", () => {
  const { observations: obs, warnings } = parseGa4(fixture, null);
  assert.deepEqual(warnings, []);
  assert.equal(find(obs, "ga4.sessions", "2026-09-25"), 32);
  assert.equal(find(obs, "ga4.new_users", "2026-09-26"), 18);
  assert.equal(find(obs, "ga4.engagement_rate", "2026-09-25"), 0.25);
  assert.equal(find(obs, "ga4.sessions", "2026-09-25", "channel:Direct"), 28);
  assert.equal(find(obs, "ga4.organic_sessions", "2026-09-26"), 2);
  // 25th: /courses/free-scrum-course/ 52 + /training/ 2
  assert.equal(find(obs, "ga4.course_page_views", "2026-09-25"), 54);
  // 26th: free course 2 + rsm-rpo march-2027 2 + safe_training 2 + s@s september-2026 1
  assert.equal(find(obs, "ga4.course_page_views", "2026-09-26"), 7);
  assert.equal(find(obs, "ga4.checkout_views", "2026-09-25"), 0);
  assert.equal(find(obs, "ga4.form_submits", "2026-09-25"), 0);
});

test("other properties are scoped under a site dimension", () => {
  const { observations: obs } = parseGa4(fixture, "scrumcraftacademy.com");
  assert.equal(find(obs, "ga4.sessions", "2026-09-25", "site:scrumcraftacademy.com"), 32);
  assert.equal(find(obs, "ga4.sessions", "2026-09-25", "site:scrumcraftacademy.com|channel:Direct"), 28);
  assert.equal(find(obs, "ga4.sessions", "2026-09-25"), undefined);
});

test("page classification", () => {
  for (const p of ["/courses/free-scrum-course/", "/training/", "/events/scrumcraft/1517627", "/events/scrumcraft",
    "/scrum-at-scale-practitioner-with-ai-september-2026/", "/rsm-rpo-with-ai-march-2027/", "/safe_training/"]) {
    assert.ok(COURSE_PAGE.test(p), p);
  }
  for (const p of ["/", "/contact/", "/blog/", "/2022/05/14/the-six-trumps/", "/checkout/view-event/id/5083947/chk/2207/"]) {
    assert.ok(!COURSE_PAGE.test(p), p);
  }
  assert.ok(CHECKOUT_PAGE.test("/checkout/view-event/id/5083947/chk/2207/"));
});

test("finds Zapier's Full Response Data link, and nothing else", () => {
  const link = "https://zapier.com/engine/hydrate/20279949/.eJw9jsFug:1xB6YF:vmoQxx4v22fI7/";
  assert.equal(findZapierFileLink(link), link);
  assert.equal(findZapierFileLink({ full_response_data: link, request: { method: "POST" } }), link);
  assert.equal(findZapierFileLink({ output: [{ "Full Response Data": `see ${link}` }] }), link);
  assert.equal(findZapierFileLink(`Full+Response+Data=${encodeURIComponent(link)}`), link);
  assert.equal(findZapierFileLink({ url: "https://evil.example.com/engine/hydrate/x" }), null);
  assert.equal(findZapierFileLink({ url: "https://zapier.com.evil.io/engine/hydrate/x" }), null);
});
