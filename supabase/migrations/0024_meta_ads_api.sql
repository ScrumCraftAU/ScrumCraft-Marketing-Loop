-- Meta ads now come from the Marketing API, pulled by the Loop (SCM-174, 7 Nov 2026), not a Zapier push.
-- Reach is per day and people can't be added across days, so it's averaged. Conversions are Meta's
-- lead actions, which need the pixel from SCM-173.

update public.sources set ingest_method = 'api_pull' where id = 'meta_ads';

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('meta_ads.reach',               'Meta reach',               'People reached per day, Facebook + Instagram (also by channel). Averaged, as people can''t be added across days', 'meta_ads', 'awareness',  'leading', 'count', 'up_good',   'avg', null, false, 14, true, null, null),
  ('meta_ads.conversions',         'Meta conversions',         'Lead conversions Meta reports, needs the Meta pixel (also by channel)',                                           'meta_ads', 'conversion', 'leading', 'count', 'up_good',   'sum', null, false, 33, true, null, null),
  ('meta_ads.cost_per_conversion', 'Meta cost per conversion', 'Meta spend / Meta conversions',                                                                                   'meta_ads', 'revenue',    'lagging', 'aud',   'down_good', 'avg', 'meta_ads.spend / meta_ads.conversions', false, 47, true, null, null);
