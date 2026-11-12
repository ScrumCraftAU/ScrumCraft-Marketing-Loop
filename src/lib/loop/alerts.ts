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
  const rounded = Math.round(count);
  const n = rounded.toLocaleString("en-AU");
  const limit = MARKETING_CONTACTS_LIMIT.toLocaleString("en-AU");
  const over = rounded >= MARKETING_CONTACTS_LIMIT;
  return {
    phase: "check",
    kind: "risk",
    severity: "alert",
    metric_key: "hubspot.marketing_contacts",
    experiment_id: null,
    title: over
      ? `Marketing contacts at ${n}, over the ${limit} tier`
      : `Marketing contacts at ${n}, nearing the ${limit} tier`,
    detail: over
      ? `HubSpot marketing contacts are at ${n}, above the ${limit} Marketing Hub included tier, so contacts past ${limit} are billed. Set inactive or unneeded contacts to non-marketing to bring the count back toward ${limit}.`
      : `HubSpot marketing contacts have reached ${n}, nearing the ${limit} Marketing Hub included tier. Set inactive or unneeded contacts to non-marketing before the count passes ${limit}, or the contacts above it will be billed.`,
  };
}
