-- LearnWorlds (ScrumCraft Academy) daily pull (src/lib/ingest/learnworlds-pull.ts, 17 Oct 2026).
-- Paid, non-refunded Academy payments by payment date, also by course (dimension course:<name>).
-- "Added by admin" enrolments are left out (usually invoiced and already a HubSpot deal).
-- Academy revenue now counts toward marketing-sourced revenue.

insert into public.sources (id, name, ingest_method) values
  ('learnworlds', 'LearnWorlds Academy', 'api_pull');

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('learnworlds.sales',   'Academy sales',   'Paid LearnWorlds payments, not refunded, excl. admin enrolments (also by course)', 'learnworlds', 'conversion', 'lagging', 'count', 'up_good', 'sum', null, false, 37, true),
  ('learnworlds.revenue', 'Academy revenue', 'LearnWorlds payment amounts, not refunded, excl. admin enrolments (AUD, also by course)', 'learnworlds', 'revenue', 'lagging', 'aud', 'up_good', 'sum', null, false, 41, true);

update public.metrics
   set formula = 'ticket_tailor.revenue + hubspot.won_revenue + learnworlds.revenue',
       description = 'Booking revenue + closed-won revenue + Academy revenue'
 where key = 'marketing.revenue';
