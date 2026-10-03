-- ScrumCraft Academy: one website (scrumcraftacademy.com), three GA4 properties.
-- scrumcraftacademy.com.au and scrumcraft-academy.learnworlds.com both 301-redirect to
-- scrumcraftacademy.com, but its Tag Manager container sent every visit to all three
-- properties, so Academy traffic was counted three times.
--
-- Decision (Jason, 2026-10-03): keep 552638790 (scrumcraftacademy.com, the owned domain);
-- retire 552648392 (.com.au, kept only to protect the name) and 497876700 (LearnWorlds,
-- off-brand). Retired properties keep their history but drop out of reporting, and the
-- ingest endpoint rejects them (410) so a stale Zap entry is noticed.

update public.sources
  set config = jsonb_set(
        jsonb_set(
          jsonb_set(config,
            '{properties,552638790,name}', '"ScrumCraft Academy (scrumcraftacademy.com)"'),
          '{properties,552648392,retired}', 'true'),
        '{properties,497876700,retired}', 'true')
  where id = 'ga4';

-- Give the kept property its history: before 3 Sep 2026 (when 552638790 was created) the
-- same site was measured only by the LearnWorlds property. Copy those days across, never
-- overwriting, with a raw_events row recording where they came from.
with provenance as (
  insert into public.raw_events (source_id, payload, processed_at, meta)
  values (
    'ga4',
    '{"backfill": "Copied pre-2026-09-03 daily values from GA4 property 497876700 (Academy, LearnWorlds) into 552638790 (scrumcraftacademy.com): same website, measured only by the LearnWorlds property before 552638790 existed."}'::jsonb,
    now(),
    '{"property": "552638790", "backfill_from": "497876700"}'::jsonb
  )
  returning id
)
insert into public.metric_observations (metric_key, date, dimension, value, raw_event_id)
select o.metric_key,
       o.date,
       'site:scrumcraftacademy.com' || substr(o.dimension, length('site:academy-learnworlds') + 1),
       o.value,
       (select id from provenance)
from public.metric_observations o
where (o.dimension = 'site:academy-learnworlds' or o.dimension like 'site:academy-learnworlds|%')
  and o.date < '2026-09-03'
on conflict (metric_key, date, dimension) do nothing;
