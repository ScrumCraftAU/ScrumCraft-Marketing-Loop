-- HubSpot daily pull (SCM-167, src/lib/ingest/hubspot-pull.ts). The funnel metrics from 0001
-- (new_contacts, mqls, sqls, deals_created, won_revenue) are reused; these add deal and email
-- counts, and turn email rates into ratios of the daily counts so window values are exact.

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('hubspot.deals_won',        'Deals won',               'HubSpot deals closed-won, by close date',               'hubspot', 'revenue',    'lagging', 'count',   'up_good', 'sum', null, false, 42, true),
  ('hubspot.emails_sent',      'Marketing emails sent',   'HubSpot marketing email sends',                         'hubspot', 'engagement', 'leading', 'count',   'up_good', 'sum', null, false, 24, true),
  ('hubspot.emails_delivered', 'Marketing emails delivered', 'HubSpot marketing emails delivered (input to rates)', 'hubspot', 'engagement', 'leading', 'count',   'up_good', 'sum', null, false, 24, false),
  ('hubspot.email_opens',      'Marketing email opens',   'HubSpot marketing email opens',                         'hubspot', 'engagement', 'leading', 'count',   'up_good', 'sum', null, false, 24, true),
  ('hubspot.email_clicks',     'Marketing email clicks',  'HubSpot marketing email clicks',                        'hubspot', 'engagement', 'leading', 'count',   'up_good', 'sum', null, false, 24, true),
  ('hubspot.email_open_rate',  'Email open rate',         'Marketing email opens / delivered',                     null,      'engagement', 'leading', 'percent', 'up_good', 'avg', 'hubspot.email_opens / hubspot.emails_delivered', false, 24, true);

update public.metrics
  set source_id = null, formula = 'hubspot.email_clicks / hubspot.emails_delivered', description = 'Marketing email clicks / delivered'
  where key = 'hubspot.email_click_rate';
