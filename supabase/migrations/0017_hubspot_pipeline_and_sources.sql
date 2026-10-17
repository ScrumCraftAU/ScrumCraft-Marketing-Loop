-- HubSpot pipeline, closed-lost deals and deal-source breakdowns (SCM-167, 17 Oct 2026).
-- Deals created / won / lost and won revenue are also stored per deal source
-- (dimension source:<deal_source>, SCM-68) and lost deals per reason (reason:<closed_lost_reason>).
-- Open pipeline is a daily snapshot, so it aggregates with "last".

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('hubspot.deals_lost',              'Deals lost',                 'HubSpot deals closed lost, by close date (also by source and reason)',             'hubspot', 'revenue', 'lagging', 'count', 'down_good', 'sum',  null, false, 43, true,  null, null),
  ('hubspot.lost_value',              'Lost deal value',            'Amount of deals closed lost (AUD)',                                                 'hubspot', 'revenue', 'lagging', 'aud',   'down_good', 'sum',  null, false, 43, true,  null, null),
  ('hubspot.win_rate',                'Win rate',                   'Deals won / (won + lost), target 25% (Operations Role Comparison Map)',             null,      'revenue', 'lagging', 'percent', 'up_good', 'avg', 'hubspot.deals_won / (hubspot.deals_won + hubspot.deals_lost)', false, 44, true, 0.25, 'month'),
  ('hubspot.open_deals',              'Open deals',                 'Deals not yet won or lost (daily snapshot)',                                        'hubspot', 'revenue', 'leading', 'count', 'up_good',   'last', null, false, 45, true,  null, null),
  ('hubspot.open_pipeline_value',     'Open pipeline',              'Amount of open deals (AUD, daily snapshot); coverage target 3x the revenue still needed for the $1.2m goal', 'hubspot', 'revenue', 'leading', 'aud', 'up_good', 'last', null, false, 45, true, null, null),
  ('hubspot.weighted_pipeline_value', 'Weighted pipeline',          'Open deal amount x stage probability (HubSpot forecast amount, daily snapshot)',   'hubspot', 'revenue', 'leading', 'aud',   'up_good',   'last', null, false, 45, true,  null, null);
