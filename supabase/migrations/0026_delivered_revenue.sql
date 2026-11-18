-- Duration-aware monthly delivered-revenue indicator (SCM-326, 8 Nov 2026).
-- HubSpot `amount` is total contract value, booked in the month a deal is won, so a $160k
-- 12-month engagement looks like a $160k spike. This spreads each deal's value across the months
-- it is actually delivered, so the monthly view reflects revenue that lands each month — the
-- relative leading indicator for the $100k-a-month goal (judged on HubSpot Won Bookings; Xero stays
-- private). Delivery duration has no HubSpot field, and the connector can't create one, so it is
-- modelled here for now and refined as contract-vs-perm deals resolve.

create table public.deal_delivery_profiles (
  deal_id      text primary key,                 -- HubSpot deal id
  revenue_type text not null default 'one_off' check (revenue_type in ('one_off', 'monthly')),
  term_months  int  not null default 1 check (term_months >= 1),
  start_date   date,                             -- delivery start; null = use the deal's close month
  note         text,
  updated_at   timestamptz not null default now()
);
-- RLS on, no policies: server-only access via the Supabase secret key (same model as every table).
alter table public.deal_delivery_profiles enable row level security;

-- Seed the one known multi-month engagement (pipeline review, 8 Nov 2026). Everything else defaults
-- to one-off in its close month until a profile is added.
insert into public.deal_delivery_profiles (deal_id, revenue_type, term_months, note) values
  ('60345085105', 'monthly', 12, 'Schneider Certification Test Engineer: $160k over a 12-month engagement');

-- Forward monthly delivered-revenue projection: won deals (last 12 months) + probability-weighted
-- open deals, each spread across its delivery months. dimension '' = the current calendar month (vs
-- the $100k goal); dimension month:YYYY-MM holds each forward month. Daily snapshot (aggregation last).
insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('hubspot.delivered_revenue', 'Delivered revenue (this month)',
   'Won + weighted-open deal value spread over the months each deal is delivered; this calendar month vs the $100k goal. month:YYYY-MM holds the forward projection.',
   'hubspot', 'revenue', 'leading', 'aud', 'up_good', 'last', null, false, 46, true, 100000, 'month');
