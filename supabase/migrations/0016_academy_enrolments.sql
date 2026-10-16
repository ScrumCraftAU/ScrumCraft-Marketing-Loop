-- Academy (LearnWorlds) enrolments from the HubSpot pull: contacts the LearnWorlds sync creates,
-- per day and per course (dimension course:<name>). Target metric for the adapted SCM-143 CTA
-- experiment, whose pages now send visitors to Academy enrolment rather than Ticket Tailor.

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('hubspot.academy_enrolments', 'Academy enrolments', 'New Academy (LearnWorlds) learners synced to HubSpot, by course; repeat learners are not counted', 'hubspot', 'conversion', 'leading', 'count', 'up_good', 'sum', null, false, 33, true);
