import { test } from "node:test";
import assert from "node:assert/strict";
import { adelaideDay, adelaideMidnight, countByDay, countByDayAndDimension, lastDays, parseEmailHistogram, sumByDay } from "./hubspot.ts";

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
