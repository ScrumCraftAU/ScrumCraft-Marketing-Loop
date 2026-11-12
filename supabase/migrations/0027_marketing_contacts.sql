-- Marketing contacts against the Marketing Hub tier (SCM-288, 12 Nov 2026).
-- The daily HubSpot pull counts contacts with hs_marketable_status = true (one search, no paging)
-- and stores it as a daily snapshot (aggregation "last"), so the series starts on the first pull.
-- The 2,000 tier limit is the target (direction down_good — lower is better); the loop run raises an
-- alert finding once the count reaches 1,800 (see src/lib/loop/alerts.ts).

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('hubspot.marketing_contacts', 'Marketing contacts', 'Contacts marketable to (hs_marketable_status = true), against the 2,000 Marketing Hub tier (daily snapshot)', 'hubspot', 'conversion', 'leading', 'count', 'down_good', 'last', null, false, 33, true, 2000, null);
