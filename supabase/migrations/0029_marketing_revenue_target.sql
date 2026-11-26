-- Initial marketing-sourced revenue target: $30k a month (25 Nov 2026).
-- marketing.revenue carried the $100k-a-month figure, but that is the whole-business mission, not
-- what marketing alone sources. Set a realistic near-term target so the loop's recommendations steer
-- toward a reachable goal and target-gap findings read honestly. The $100k mission stays the overall aim.
update public.metrics
  set target_value = 30000
  where key = 'marketing.revenue';
