-- Funnel targets agreed with Jason on 16 Oct 2026 (Operations Role Comparison Map, owned by
-- Operations; definitions in Confluence "Lead & Deal Stage Definitions", SCM-199). Only the
-- marketing-funnel targets live here; company and product goals stay in Jira Goals and the Role Map.

-- ≥ 30 MQLs a quarter.
update public.metrics set target_value = 10, target_period = 'month' where key = 'hubspot.mqls';

-- 25% MQL → SQL conversion.
insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('hubspot.mql_to_sql_rate', 'MQL-to-SQL rate', 'SQLs / MQLs (Daizy qualifies MQLs after a conversation)', null, 'conversion', 'leading', 'percent', 'up_good', 'avg', 'hubspot.sqls / hubspot.mqls', false, 35, true, 0.25, 'month');

-- $1.2m revenue goal for the year = $100k a month.
update public.metrics
  set target_value = 100000, target_period = 'month',
      description = 'Booking revenue + closed-won revenue (goal: $1.2m a year)'
  where key = 'marketing.revenue';
