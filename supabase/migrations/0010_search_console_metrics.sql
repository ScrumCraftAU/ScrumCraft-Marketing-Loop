-- Search Console (SCM-170), read through the main-site GA4 property's Search Console link and
-- sent by the GA4 Zap as its own request for 552676870 (see searchConsoleRequestBody()).
-- Position is stored impression-weighted (position × impressions) so the derived averages are
-- exact over any window. Per-page values are stored under dimension 'page:<path>'.

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active) values
  ('gsc.clicks',                 'Search clicks',                 'Organic Google Search clicks to scrumcraft.com (Search Console)',               'ga4', 'awareness', 'leading', 'count',    'up_good',   'sum', null, false, 17, true),
  ('gsc.impressions',            'Search impressions',            'Times scrumcraft.com appeared in Google Search results (Search Console)',       'ga4', 'awareness', 'leading', 'count',    'up_good',   'sum', null, false, 18, true),
  ('gsc.position_weight',        'Search position × impressions', 'Input to gsc.avg_position',                                                    'ga4', 'awareness', 'leading', 'count',    'up_good',   'sum', null, false, 19, false),
  ('gsc.ctr',                    'Search click-through rate',     'Search clicks / search impressions',                                           null,  'awareness', 'leading', 'percent',  'up_good',   'avg', 'gsc.clicks / gsc.impressions', false, 20, true),
  ('gsc.avg_position',           'Avg. search position',          'Impression-weighted average Google position, all pages',                       null,  'awareness', 'leading', 'position', 'down_good', 'avg', 'gsc.position_weight / gsc.impressions', false, 21, true),
  ('gsc.course_clicks',          'Course page search clicks',     'Organic Google Search clicks landing on course and program pages',             'ga4', 'awareness', 'leading', 'count',    'up_good',   'sum', null, false, 22, true),
  ('gsc.course_impressions',     'Course page search impressions','Search impressions for course and program pages',                              'ga4', 'awareness', 'leading', 'count',    'up_good',   'sum', null, false, 23, true),
  ('gsc.course_position_weight', 'Course position × impressions', 'Input to gsc.course_avg_position',                                             'ga4', 'awareness', 'leading', 'count',    'up_good',   'sum', null, false, 24, false),
  ('gsc.course_avg_position',    'Avg. course page position',     'Impression-weighted average Google position for course and program pages',     null,  'awareness', 'leading', 'position', 'down_good', 'avg', 'gsc.course_position_weight / gsc.course_impressions', false, 25, true);
