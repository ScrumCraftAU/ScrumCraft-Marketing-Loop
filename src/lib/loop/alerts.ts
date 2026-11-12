/**
 * Deterministic rule findings — raised in code each loop run, independent of the model analysis.
 * Pure and dependency-free so they can be unit-tested with `node --test`.
 */

/** Marketing Hub included-contact tier; billing moves to the next tier above this (SCM-288). */
export const MARKETING_CONTACTS_LIMIT = 2000;
/** Raise the alert once the count reaches this, leaving headroom before the limit. */
export const MARKETING_CONTACTS_ALERT_AT = 1800;

export interface RuleFinding {
  phase: "check" | "act";
  kind: "anomaly" | "trend" | "target_gap" | "win" | "risk" | "experiment_result" | "recommendation";
  severity: "info" | "watch" | "alert";
  metric_key: string | null;
  experiment_id: string | null;
  title: string;
  detail: string;
}

/**
 * Alert when HubSpot marketing contacts reach the threshold (SCM-288). Below the threshold returns
 * null (no finding); at or above it returns an alert finding naming the count and the next step, so
 * an import or integration can't push us past the 2,000 tier unnoticed.
 */
export function marketingContactsAlert(count: number | null | undefined): RuleFinding | null {
  if (count == null || !Number.isFinite(count) || count < MARKETING_CONTACTS_ALERT_AT) return null;
  const n = Math.round(count).toLocaleString("en-AU");
  const limit = MARKETING_CONTACTS_LIMIT.toLocaleString("en-AU");
  const at = MARKETING_CONTACTS_ALERT_AT.toLocaleString("en-AU");
  return {
    phase: "check",
    kind: "risk",
    severity: "alert",
    metric_key: "hubspot.marketing_contacts",
    experiment_id: null,
    title: `Marketing contacts at ${n}, nearing the ${limit} limit`,
    detail: `HubSpot marketing contacts have reached ${n}, at or above the ${at} alert threshold for the ${limit} Marketing Hub tier (in effect from 1 Dec 2026). Set inactive or unneeded contacts to non-marketing before the count passes ${limit}, or the next contact tier will be billed.`,
  };
}
