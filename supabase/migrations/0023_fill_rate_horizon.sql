-- Course fill rate now fills from the Ticket Tailor pull (SCM-311, 7 Nov 2026). Courses are scheduled
-- months ahead, so the window moves from 60 to 180 days. It looks forward, so it's a leading indicator.
update public.metrics
set description = 'Seats sold / capacity for public paid courses in the next 180 days (daily snapshot, also by course)',
    indicator = 'leading'
where key = 'ticket_tailor.fill_rate';
