-- Ticket Tailor moved its GA4 tracking to its own property (552649204) around 1–3 Sep 2026,
-- so checkout page views stopped appearing in the main-site property and the dashboard's
-- checkout tile read 0 (booking-path smoke test, 9 Oct). Ticket Tailor's checkout views and
-- purchases now roll into main-site totals under their own keys, combined for the dashboard.

update public.sources
  set config = jsonb_set(config, '{properties,552649204,booking_site}', 'true')
  where id = 'ga4';

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('ga4.purchases',              'GA4 purchases',                'GA4 purchase events, per site',                                        'ga4', 'conversion', 'lagging', 'count', 'up_good', 'sum', null, false, 38, false),
  ('ga4.booking_checkout_views', 'Ticket Tailor checkout views', 'Checkout pages viewed on Ticket Tailor (its own GA4 property)',          'ga4', 'conversion', 'leading', 'count', 'up_good', 'sum', null, false, 31, false),
  ('ga4.booking_purchases',      'Course bookings (GA4)',        'Ticket Tailor purchases recorded in GA4; cross-check with Ticket Tailor orders', 'ga4', 'conversion', 'lagging', 'count', 'up_good', 'sum', null, false, 36, true),
  ('checkout.views',             'Checkout page views',          'Checkout pages viewed: scrumcraft.com plus Ticket Tailor',             null,  'conversion', 'leading', 'count', 'up_good', 'sum', 'ga4.checkout_views + ga4.booking_checkout_views', false, 30, true);

-- The combined tile replaces the main-site-only one (still stored and used as an input).
update public.metrics
  set active = false, description = 'Checkout pages viewed on scrumcraft.com only (input to checkout.views)'
  where key = 'ga4.checkout_views';
