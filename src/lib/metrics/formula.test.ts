import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula } from "./formula.ts";

test("sums treat a missing part as zero, but not when every part is missing", () => {
  assert.equal(evaluateFormula("a.x + b.y", { "a.x": 3, "b.y": null }), 3);
  assert.equal(evaluateFormula("a.x + b.y", { "a.x": 3, "b.y": 4 }), 7);
  assert.equal(evaluateFormula("a.x + b.y", {}), null);
  assert.equal(evaluateFormula("a.x - b.y", { "a.x": null, "b.y": 2 }), -2);
});

test("ratios still need both sides and guard divide-by-zero", () => {
  assert.equal(evaluateFormula("a.x / b.y", { "a.x": 6, "b.y": 3 }), 2);
  assert.equal(evaluateFormula("a.x / b.y", { "a.x": 6, "b.y": null }), null);
  assert.equal(evaluateFormula("a.x / b.y", { "a.x": 6, "b.y": 0 }), null);
  // blended CTR with one ad platform unconnected uses the connected one's numbers
  assert.equal(evaluateFormula("(l.c + m.c) / (l.i + m.i)", { "l.c": 10, "m.c": null, "l.i": 100, "m.i": null }), 0.1);
});
