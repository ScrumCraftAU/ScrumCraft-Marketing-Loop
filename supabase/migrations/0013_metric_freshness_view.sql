-- Latest observation date per metric, for the Online / Offline status in the metric catalog.
-- A view keeps the aggregation in Postgres (the API caps row reads at 1,000).
create view public.metric_freshness
  with (security_invoker = on) as
  select metric_key, max(date) as latest_date
  from public.metric_observations
  group by metric_key;
