-- Pipeline coverage metric + win-rate caveat (SCM-358, 18 Nov 2026).
-- Win rate already exists (migration 0017: hubspot.deals_won / (won + lost), target 25%).
-- This adds pipeline coverage (open pipeline / the $1.2m a year goal, target 3x) and records on
-- win_rate that closed-lost deals are under-logged in HubSpot, so the rate reads optimistically.

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('hubspot.pipeline_coverage', 'Pipeline coverage',
   'Open pipeline / the $1.2m a year revenue goal; target 3x. The denominator is the annual goal as a first version (Operations to confirm, SCM-358).',
   null, 'revenue', 'leading', 'ratio', 'up_good', 'last',
   'hubspot.open_pipeline_value / 1200000', false, 46, true, 3, null);

update public.metrics
  set description = 'Deals won / (won + lost), target 25% (Operations Role Comparison Map). Indicative: many lost deals are not logged in HubSpot, so the true rate is likely lower.'
  where key = 'hubspot.win_rate';
