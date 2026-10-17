import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseBreakdowns, type BreakdownRow } from "./breakdowns.ts";

const agg = new Map([
  ["hubspot.won_revenue", "sum"],
  ["hubspot.open_pipeline_value", "last"],
  ["ga4.sessions", "sum"],
  ["gsc.position_weight", "sum"],
  ["ga4.engagement_rate", "avg"],
]);

test("sums by source over 7 and 90 days, latest snapshot for pipeline, skips sites and weights", () => {
  const rows: BreakdownRow[] = [
    { metric_key: "hubspot.won_revenue", date: "2026-10-14", dimension: "source:cognism", value: 42000 },
    { metric_key: "hubspot.won_revenue", date: "2026-10-05", dimension: "source:repeat / expansion", value: 1250 },
    { metric_key: "hubspot.won_revenue", date: "2026-10-18", dimension: "source:linkedin", value: 999 }, // after as_of
    { metric_key: "hubspot.open_pipeline_value", date: "2026-10-15", dimension: "source:linkedin", value: 5000 },
    { metric_key: "hubspot.open_pipeline_value", date: "2026-10-16", dimension: "source:repeat / expansion", value: 84250 },
    { metric_key: "hubspot.open_pipeline_value", date: "2026-10-16", dimension: "source:linkedin", value: 2999 },
    { metric_key: "ga4.sessions", date: "2026-10-16", dimension: "site:clarity", value: 50 },
    { metric_key: "gsc.position_weight", date: "2026-10-16", dimension: "page:/training/", value: 900 },
    { metric_key: "ga4.engagement_rate", date: "2026-10-16", dimension: "channel:email", value: 0.5 },
  ];
  const out = summariseBreakdowns(rows, agg, "2026-10-16");
  const find = (k: string, w: string) => out.find((b) => b.metric_key === k && b.window === w);

  assert.deepEqual(find("hubspot.won_revenue", "last_7_days")?.values, [{ label: "cognism", value: 42000 }]);
  const q = find("hubspot.won_revenue", "last_90_days")!;
  assert.deepEqual(q.values.map((v) => v.label), ["cognism", "repeat / expansion"]);
  assert.equal(q.data_from, "2026-10-05");

  const p = find("hubspot.open_pipeline_value", "latest")!;
  assert.equal(p.as_of, "2026-10-16");
  assert.deepEqual(p.values, [{ label: "repeat / expansion", value: 84250 }, { label: "linkedin", value: 2999 }]);

  assert.equal(out.some((b) => b.metric_key === "ga4.sessions" || b.metric_key === "gsc.position_weight" || b.metric_key === "ga4.engagement_rate"), false);
});

test("keeps the top 10 labels and rolls the rest into other_total", () => {
  const rows: BreakdownRow[] = Array.from({ length: 12 }, (_, i) => ({ metric_key: "ga4.sessions", date: "2026-10-16", dimension: `page:/p${i}/`, value: i + 1 }));
  const b = summariseBreakdowns(rows, agg, "2026-10-16").find((x) => x.window === "last_7_days")!;
  assert.equal(b.values.length, 10);
  assert.equal(b.values[0].value, 12);
  assert.equal(b.others, 2);
  assert.equal(b.other_total, 3);
});
