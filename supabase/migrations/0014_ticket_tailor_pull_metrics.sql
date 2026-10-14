-- Ticket Tailor daily pull (SCM-169, src/lib/ingest/ticket-tailor-pull.ts). orders, tickets and
-- revenue come from 0001; this adds free sign-ups ($0 orders such as the free Registered Scrum
-- Basics) and checkout-to-booking conversion, and sharpens the booking definitions.

update public.metrics set description = 'Paid Ticket Tailor orders (completed or pending), by order date' where key = 'ticket_tailor.orders';
update public.metrics set description = 'Valid event tickets on paid Ticket Tailor orders' where key = 'ticket_tailor.tickets';
update public.metrics set description = 'Ticket Tailor order totals less refunds (AUD, incl. GST)' where key = 'ticket_tailor.revenue';

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('ticket_tailor.free_signups', 'Free course sign-ups',        '$0 Ticket Tailor orders, e.g. the free Registered Scrum Basics', 'ticket_tailor', 'conversion', 'leading', 'count',   'up_good', 'sum', null, false, 33, true),
  ('checkout.conversion',        'Checkout-to-booking rate',    'Ticket Tailor bookings / checkout page views',                   null,            'conversion', 'lagging', 'percent', 'up_good', 'avg', 'ticket_tailor.orders / checkout.views', false, 35, true);
