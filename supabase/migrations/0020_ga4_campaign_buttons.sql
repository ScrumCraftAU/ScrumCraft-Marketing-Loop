-- GA4 UTM campaign × utm_content report (SCM-204, 20 Oct 2026): which page and button sent the visit.
-- Stored per GA4 property as the site total of tagged sessions (dimension '' or site:<key>) plus
-- campaign:<name>|content:<utm_content> breakdowns. Untagged traffic ("(direct)", "(organic)"…) is left out.

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('ga4.campaign_sessions',   'Tagged campaign sessions',   'Sessions from UTM-tagged links (by campaign and utm_content button)',   'ga4', 'engagement', 'leading', 'count', 'up_good', 'sum', null, false, 26, true),
  ('ga4.campaign_key_events', 'Tagged campaign key events', 'GA4 key events in sessions from UTM-tagged links (by campaign and button)', 'ga4', 'conversion', 'leading', 'count', 'up_good', 'sum', null, false, 31, true);
