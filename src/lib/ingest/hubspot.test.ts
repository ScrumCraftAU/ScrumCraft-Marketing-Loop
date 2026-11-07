import { test } from "node:test";
import assert from "node:assert/strict";
import { adelaideDay, adelaideMidnight, countByDay, countByDayAndDimension, intentSnapshot, lastDays, pipelineSnapshot, summariseProbe, sumByDayAndDimension, parseEmailHistogram, sumByDay, withoutExcludedDeals, withoutMqlBackfills, checkEmailBreakdown, emailObservations, emailsToBreakDown } from "./hubspot.ts";

test("Adelaide days and midnights, either side of daylight saving", () => {
  // 13 Oct 2026 is daylight time (UTC+10:30): midnight is 13:30 UTC the day before.
  assert.equal(new Date(adelaideMidnight("2026-10-13")).toISOString(), "2026-10-12T13:30:00.000Z");
  // 1 Jul 2026 is standard time (UTC+9:30).
  assert.equal(new Date(adelaideMidnight("2026-07-01")).toISOString(), "2026-06-30T14:30:00.000Z");
  assert.equal(adelaideDay("2026-10-12T13:29:59Z"), "2026-10-12");
  assert.equal(adelaideDay("2026-10-12T13:30:00Z"), "2026-10-13");
  assert.equal(adelaideDay("1791898051968"), adelaideDay(1791898051968));
});

test("lastDays ends yesterday and crosses the DST change cleanly", () => {
  const days = lastDays(10, new Date("2026-10-08T02:00:00Z")); // DST starts 4 Oct 2026
  assert.equal(days.length, 10);
  assert.equal(days[9], "2026-10-07");
  assert.equal(days[0], "2026-09-28");
  assert.equal(new Set(days).size, 10);
});

test("count and sum by Adelaide day, zero-filled", () => {
  const days = ["2026-10-12", "2026-10-13"];
  const recs = [
    { properties: { closedate: "2026-10-12T14:00:00Z", amount_in_home_currency: "1500" } }, // 13 Oct in Adelaide
    { properties: { closedate: "2026-10-12T01:00:00Z", amount_in_home_currency: "500" } },
    { properties: { closedate: "2026-09-01T01:00:00Z", amount_in_home_currency: "999" } }, // outside the window
    { properties: { closedate: null, amount_in_home_currency: "1" } },
  ];
  assert.deepEqual(countByDay(recs, "closedate", days, "hubspot.deals_won").map((o) => o.value), [1, 1]);
  assert.deepEqual(sumByDay(recs, "closedate", "amount_in_home_currency", days, "hubspot.won_revenue").map((o) => o.value), [500, 1500]);
  assert.deepEqual(countByDay([], "closedate", days, "x").map((o) => o.value), [0, 0]);
});

test("email histogram parses counters and zero-fills missing days", () => {
  const days = ["2026-10-12", "2026-10-13"];
  const payload = { results: [{ interval: { start: "2026-10-13T00:00:00Z" }, aggregations: { counters: { sent: 120, delivered: 118, open: 40, click: 6 } } }] };
  const { observations, warnings } = parseEmailHistogram(payload, days);
  assert.deepEqual(warnings, []);
  const v = (k: string, d: string) => observations.find((o) => o.metric_key === k && o.date === d)?.value;
  assert.equal(v("hubspot.emails_sent", "2026-10-13"), 120);
  assert.equal(v("hubspot.email_clicks", "2026-10-13"), 6);
  assert.equal(v("hubspot.emails_sent", "2026-10-12"), 0);
  assert.equal(parseEmailHistogram({}, days).warnings.length, 1);
});

test("Academy enrolments are counted per Adelaide day and per course", () => {
  const days = ["2026-10-13", "2026-10-14"];
  const recs = [
    { properties: { createdate: "2026-10-13T06:26:49Z", last_course_booked: "Registered Scrum Basics" } },
    { properties: { createdate: "2026-10-13T20:33:40Z", last_course_booked: "Registered Scrum Basics" } }, // 14 Oct in Adelaide
    { properties: { createdate: "2026-10-13T07:00:00Z", last_course_booked: null } },
  ];
  const byCourse = countByDayAndDimension(recs, "createdate", "last_course_booked", days, "hubspot.academy_enrolments", "course");
  const v = (date: string, dim: string) => byCourse.find((o) => o.date === date && o.dimension === dim)?.value;
  assert.equal(v("2026-10-13", "course:registered scrum basics"), 1);
  assert.equal(v("2026-10-14", "course:registered scrum basics"), 1);
  assert.equal(v("2026-10-13", "course:unknown"), 1);
  assert.equal(countByDay(recs, "createdate", days, "hubspot.academy_enrolments")[0].value, 2);
});

test("won revenue is summed per day and deal source", () => {
  const won = [
    { properties: { closedate: "2026-10-14T02:43:50Z", amount_in_home_currency: "42000", deal_source: "Cognism" } },
    { properties: { closedate: "2026-10-14T05:00:00Z", amount_in_home_currency: "1000", deal_source: "Organic search" } },
    { properties: { closedate: "2026-10-14T06:00:00Z", amount_in_home_currency: "500", deal_source: null } },
  ];
  const obs = sumByDayAndDimension(won, "closedate", "amount_in_home_currency", "deal_source", ["2026-10-14"], "hubspot.won_revenue", "source");
  const v = (dim: string) => obs.find((o) => o.dimension === dim)?.value;
  assert.equal(v("source:cognism"), 42000);
  assert.equal(v("source:organic search"), 1000);
  assert.equal(v("source:unknown"), 500);
});

test("open pipeline is a snapshot on one day, overall and by source", () => {
  const open = [
    { properties: { amount_in_home_currency: "30000", hs_projected_amount_in_home_currency: "24000", deal_source: "Government panel / tender" } },
    { properties: { amount_in_home_currency: "25999", hs_projected_amount_in_home_currency: "10400", deal_source: "Referral" } },
  ];
  const obs = pipelineSnapshot(open, "2026-10-16");
  const v = (key: string, dim = "") => obs.find((o) => o.metric_key === key && o.dimension === dim)?.value;
  assert.ok(obs.every((o) => o.date === "2026-10-16"));
  assert.equal(v("hubspot.open_deals"), 2);
  assert.equal(v("hubspot.open_pipeline_value"), 55999);
  assert.equal(v("hubspot.weighted_pipeline_value"), 34400);
  assert.equal(v("hubspot.open_pipeline_value", "source:referral"), 25999);
  assert.equal(pipelineSnapshot([], "2026-10-16").find((o) => o.metric_key === "hubspot.open_deals")?.value, 0);
});

test("Buyer Intent is a snapshot on one day, overall and by company", () => {
  const companies = [
    { properties: { name: "Australia Post", hs_recent_intent_signals: "4-9304136;4-5470332;4-5470329", hs_intent_visitors_last_30_days: "2", hs_intent_page_views_last_30_days: "2" } },
    { properties: { name: "TAFE SA", hs_recent_intent_signals: "4-11038405", hs_intent_visitors_last_30_days: "0", hs_intent_page_views_last_30_days: "0" } },
    { properties: { name: "SA Water", hs_recent_intent_signals: null, hs_intent_visitors_last_30_days: "1", hs_intent_page_views_last_30_days: "4" } },
    { properties: { name: "Quiet Co", hs_recent_intent_signals: "", hs_intent_visitors_last_30_days: null, hs_intent_page_views_last_30_days: null } },
  ];
  const obs = intentSnapshot(companies, "2026-11-05");
  const v = (key: string, dim = "") => obs.find((o) => o.metric_key === key && o.dimension === dim)?.value;
  assert.ok(obs.every((o) => o.date === "2026-11-05"));
  assert.equal(v("hubspot.intent_watchlist_companies"), 4);
  assert.equal(v("hubspot.intent_companies_with_signals"), 2);
  assert.equal(v("hubspot.intent_signal_types"), 4);
  assert.equal(v("hubspot.intent_companies_visited"), 2);
  assert.equal(v("hubspot.intent_tracked_visitors"), 3);
  assert.equal(v("hubspot.intent_tracked_page_views"), 6);
  assert.equal(v("hubspot.intent_signal_types", "company:australia post"), 3);
  assert.equal(v("hubspot.intent_tracked_visitors", "company:australia post"), 2);
  assert.equal(obs.some((o) => o.dimension === "company:quiet co"), false); // zero values aren't stored per company
  // No tracked companies still gives zero totals, not a gap.
  assert.equal(intentSnapshot([], "2026-11-05").find((o) => o.metric_key === "hubspot.intent_watchlist_companies")?.value, 0);
});

test("an API probe keeps the reply's shape but none of its values", () => {
  const reply = { broadcasts: [{ broadcastGuid: "abc", content: { body: "Private post text" }, clicks: 12, stats: { likes: 3 } }] };
  const summary = summariseProbe(reply);
  assert.equal(summary.items, 1);
  assert.deepEqual(summary.fields, ["broadcastGuid", "clicks", "content", "stats"]);
  assert.deepEqual(summary.nested, { content: ["body"], stats: ["likes"] });
  assert.equal(JSON.stringify(summary).includes("Private post text"), false);
  assert.equal(JSON.stringify(summary).includes("abc"), false);
  assert.equal(summariseProbe([{ a: 1 }, { a: 2 }]).items, 2);
  assert.equal(summariseProbe({ a: 1 }).items, null);
  assert.deepEqual(summariseProbe(null).fields, []);
});

test("deals added by hand for LearnWorlds sales are left out", () => {
  const deals = [{ id: "49779082773" }, { id: "60070268588" }, { id: "65578234244" }];
  assert.deepEqual(withoutExcludedDeals(deals).map((d) => d.id), ["65578234244"]);
});

test("the SCM-220 MQL backfill is left out, MQLs either side of it count", () => {
  const p = "hs_v2_date_entered_marketingqualifiedlead";
  const contacts = [
    { id: "a", properties: { [p]: "2026-10-27T16:04:47.259Z" } }, // in the backfill
    { id: "b", properties: { [p]: String(Date.parse("2026-10-27T16:05:30.281Z")) } }, // in it, as epoch ms
    { id: "c", properties: { [p]: "2026-10-27T15:59:59.000Z" } },
    { id: "d", properties: { [p]: "2026-10-29T02:10:00.000Z" } },
    { id: "e", properties: { [p]: null } },
  ];
  assert.deepEqual(withoutMqlBackfills(contacts, p).map((c) => c.id), ["c", "d", "e"]);
});

test("per-email breakdown: which emails, their daily counters, and the over-count guard", () => {
  const days = ["2026-10-12", "2026-10-13"];
  const emails = [
    { id: "1", name: "Manufacturing PM Introduction", type: "BATCH_EMAIL", publishDate: "2026-07-08T08:00:00Z" },
    { id: "2", name: "October newsletter", type: "BATCH_EMAIL", publishDate: "2026-10-12T22:00:00Z" },
    { id: "3", name: "RSB welcome", type: "AUTOMATED_EMAIL", publishDate: "2025-01-01T00:00:00Z" },
    { id: "4", name: "Draft", type: "BATCH_EMAIL", publishDate: null },
  ];
  assert.deepEqual(emailsToBreakDown(emails, "2026-10-11T13:30:00Z").map((e) => e.id), ["2", "3"]);

  const hist = { results: [{ interval: { start: "2026-10-13T00:00:00Z" }, aggregations: { counters: { sent: 100, delivered: 98, open: 30, click: 4 } } }] };
  const obs = emailObservations(hist, days, emails[1]);
  const v = (k: string) => obs.find((o) => o.metric_key === k && o.date === "2026-10-13")?.value;
  assert.equal(v("hubspot.emails_sent"), 100);
  assert.equal(v("hubspot.email_opens"), 30);
  assert.equal(obs[0].dimension, "email:october newsletter");
  assert.equal(obs.some((o) => o.date === "2026-10-12"), false); // zero days are not stored

  const totals = [{ metric_key: "hubspot.emails_sent", date: "2026-10-13", dimension: "", value: 120 }];
  assert.equal(checkEmailBreakdown(obs, totals), null);
  // the API ignored the email filter: every email came back with the full total
  const twice = [...obs, ...obs.map((o) => ({ ...o, dimension: "email:rsb welcome" }))];
  assert.match(checkEmailBreakdown(twice, totals) ?? "", /exceed/);
});
