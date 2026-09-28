import { test } from "node:test";
import assert from "node:assert/strict";
import { storageToText } from "./text.ts";

test("drops macro settings and keeps structure", () => {
  const html =
    '<ac:structured-macro ac:name="info"><ac:parameter ac:name="icon">false</ac:parameter>' +
    "<ac:rich-text-body><p>Please make sure you have read this guide.</p></ac:rich-text-body></ac:structured-macro>" +
    "<h1>Brand colours</h1><ul><li>Purple (#3e225c)</li><li>Orange &amp; more</li></ul>" +
    '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="maxLevel">2</ac:parameter></ac:structured-macro>';
  const text = storageToText(html);
  assert.ok(text.startsWith("Please make sure"), text);
  assert.ok(!text.includes("false"));
  assert.match(text, /# Brand colours\n+- Purple \(#3e225c\)\n- Orange & more/);
});
