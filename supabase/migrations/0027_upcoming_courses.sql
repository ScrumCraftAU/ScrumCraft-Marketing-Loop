-- Full count of upcoming public paid courses on Ticket Tailor, no horizon cap (25 Nov 2026).
-- ticket_tailor.fill_rate only covers courses starting within the next 180 days (0023, SCM-311),
-- so the loop read the fill window as the whole calendar and reported "only two public dates" when
-- five were scheduled. This metric is the full upcoming count, so the narrative sees the real calendar.
insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('ticket_tailor.upcoming_courses', 'Upcoming public courses',
   'Number of upcoming published paid public courses on sale through Ticket Tailor, with no horizon cap. The fill_rate metric only covers courses within the next 180 days, so this gives the full scheduled calendar.',
   'ticket_tailor', 'conversion', 'leading', 'count', 'up_good', 'last',
   null, false, 38, true, null, null);
