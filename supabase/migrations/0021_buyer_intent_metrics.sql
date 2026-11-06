-- Buyer Intent watchlist metrics (SCM-254, 6 Nov 2026).
-- HubSpot has no Buyer Intent API, so these come from company properties through the CRM API:
-- hs_intent_signals_enabled, hs_recent_intent_signals, hs_intent_visitors_last_30_days and
-- hs_intent_page_views_last_30_days. HubSpot keeps only the rolling 30-day values, so each is a
-- daily snapshot (aggregation "last") and the series starts on the first pull.
-- Signal types, visitors and page views are also stored per company (dimension company:<name>).

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('hubspot.intent_watchlist_companies',     'Intent companies tracked',    'Companies with Buyer Intent signals active (daily snapshot)',                                              'hubspot', 'engagement', 'leading', 'count', 'up_good', 'last', null, false, 36, true, null, null),
  ('hubspot.intent_companies_with_signals',  'Companies with signals',      'Tracked companies with at least one intent signal in the last 30 days (daily snapshot)',                   'hubspot', 'engagement', 'leading', 'count', 'up_good', 'last', null, false, 36, true, null, null),
  ('hubspot.intent_signal_types',            'Intent signal types',         'Distinct signal types per tracked company in the last 30 days, added up (daily snapshot, also by company)', 'hubspot', 'engagement', 'leading', 'count', 'up_good', 'last', null, false, 36, true, null, null),
  ('hubspot.intent_companies_visited',       'Tracked companies visiting',  'Tracked companies with a tracked site visitor in the last 30 days (daily snapshot)',                       'hubspot', 'engagement', 'leading', 'count', 'up_good', 'last', null, false, 36, true, null, null),
  ('hubspot.intent_tracked_visitors',        'Tracked company visitors',    'De-anonymised visitors from tracked companies in the last 30 days (daily snapshot, also by company)',      'hubspot', 'engagement', 'leading', 'count', 'up_good', 'last', null, false, 36, true, null, null),
  ('hubspot.intent_tracked_page_views',      'Tracked company page views',  'De-anonymised page views from tracked companies in the last 30 days (daily snapshot, also by company)',    'hubspot', 'engagement', 'leading', 'count', 'up_good', 'last', null, false, 36, true, null, null);
