import { test } from "node:test";
import assert from "node:assert/strict";
import { insightsToObservations, leadsFrom, linkClicksFrom, type MetaInsightRow } from "./meta-ads.ts";

test("Meta insights become daily totals and a row per platform", () => {
  const days = ["2026-11-01", "2026-11-02"];
  const rows: MetaInsightRow[] = [
    { date_start: "2026-11-01", spend: "12.50", impressions: "1000", reach: "800", clicks: "20", actions: [{ action_type: "lead", value: "2" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "2" }] },
    { date_start: "2026-10-30", spend: "99", impressions: "9" }, // outside the window
  ];
  const platforms: MetaInsightRow[] = [
    { date_start: "2026-11-01", publisher_platform: "instagram", spend: "5", impressions: "400", reach: "300", clicks: "5" },
    { date_start: "2026-11-01", publisher_platform: "facebook", spend: "7.50", impressions: "600", reach: "500", clicks: "15" },
  ];
  const obs = insightsToObservations(rows, platforms, days);
  const v = (k: string, d: string, dim = "") => obs.find((o) => o.metric_key === k && o.date === d && o.dimension === dim)?.value;
  assert.equal(v("meta_ads.spend", "2026-11-01"), 12.5);
  assert.equal(v("meta_ads.reach", "2026-11-01"), 800);
  assert.equal(v("meta_ads.conversions", "2026-11-01"), 2); // not doubled by the pixel_lead row
  assert.equal(v("meta_ads.spend", "2026-11-02"), 0); // no spend still stores 0, not a gap
  assert.equal(v("meta_ads.impressions", "2026-11-01", "channel:instagram"), 400);
  assert.equal(v("meta_ads.clicks", "2026-11-01", "channel:facebook"), 15);
  assert.equal(v("meta_ads.conversions", "2026-11-01", "channel:facebook"), undefined); // zero values aren't stored per platform
  assert.equal(obs.some((o) => o.date === "2026-10-30"), false);
});

test("clicks are link clicks when Meta reports them", () => {
  assert.equal(linkClicksFrom({ date_start: "2026-09-01", clicks: "5", actions: [{ action_type: "link_click", value: "7" }] }), 7);
  assert.equal(linkClicksFrom({ date_start: "2026-09-01", clicks: "5", actions: [{ action_type: "lead", value: "1" }] }), 5);
  assert.equal(linkClicksFrom({ date_start: "2026-09-01" }), 0);
});

test("leads use Meta's combined count, or its parts when that's missing", () => {
  assert.equal(leadsFrom([{ action_type: "offsite_conversion.fb_pixel_lead", value: "3" }, { action_type: "onsite_conversion.lead_grouped", value: "1" }]), 4);
  assert.equal(leadsFrom([{ action_type: "link_click", value: "30" }]), 0);
  assert.equal(leadsFrom(null), 0);
});
