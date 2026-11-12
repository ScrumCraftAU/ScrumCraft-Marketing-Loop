import { test } from "node:test";
import assert from "node:assert/strict";
import { marketingContactsAlert, MARKETING_CONTACTS_ALERT_AT, MARKETING_CONTACTS_LIMIT } from "./alerts.ts";

test("no alert below the threshold", () => {
  for (const count of [0, 1265, 1799, MARKETING_CONTACTS_ALERT_AT - 1]) {
    assert.equal(marketingContactsAlert(count), null, `expected no alert at ${count}`);
  }
});

test("no alert when the count is missing", () => {
  assert.equal(marketingContactsAlert(null), null);
  assert.equal(marketingContactsAlert(undefined), null);
  assert.equal(marketingContactsAlert(Number.NaN), null);
});

test("alert at or above the threshold", () => {
  for (const count of [MARKETING_CONTACTS_ALERT_AT, 1950, MARKETING_CONTACTS_LIMIT]) {
    const finding = marketingContactsAlert(count);
    assert.ok(finding, `expected an alert at ${count}`);
    assert.equal(finding.severity, "alert");
    assert.equal(finding.phase, "check");
    assert.equal(finding.kind, "risk");
    assert.equal(finding.metric_key, "hubspot.marketing_contacts");
    assert.match(finding.title, /1,800|nearing/);
    assert.match(finding.detail, /2,000/);
  }
});

test("the count appears in the message", () => {
  const finding = marketingContactsAlert(1850);
  assert.ok(finding);
  assert.match(finding.title, /1,850/);
});
