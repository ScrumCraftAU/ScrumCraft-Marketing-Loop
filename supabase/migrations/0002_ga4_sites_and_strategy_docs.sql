-- GA4 via Zapier: real conversion metrics, multi-property site map, and strategy docs
-- (Confluence) that ground the daily loop.

-- ga4.key_events on www.scrumcraft.com only counts `reduced_bounce_rate` (an engagement
-- ping), so it is retired in favour of concrete conversion events.
update public.metrics
  set active = false,
      description = 'Retired: the property''s only key event is reduced_bounce_rate, not a conversion'
  where key = 'ga4.key_events';

update public.metrics
  set description = 'Views of course / event pages (/courses/, /training/, dated course pages, Ticket Tailor /events/scrumcraft)'
  where key = 'ga4.course_page_views';

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order) values
  ('ga4.form_submits',   'Form submissions',    'GA4 form_submit events (enquiries, sign-ups)',       'ga4', 'conversion', 'leading', 'count', 'up_good', 'sum', null, false, 29),
  ('ga4.checkout_views', 'Checkout page views', 'Ticket Tailor checkout pages (/checkout/…) viewed', 'ga4', 'conversion', 'leading', 'count', 'up_good', 'sum', null, false, 30);

-- GA4 property → site. site = null is the main site (stored as the total, dimension '');
-- anything else is stored under dimension 'site:<site>'. brand groups sites for the loop.
update public.sources
  set enabled = true,
      config = '{
        "properties": {
          "317178274": { "site": null,                       "name": "www.scrumcraft.com",        "brand": "ScrumCraft" },
          "552649204": { "site": "tickettailor",             "name": "Ticket Tailor event pages", "brand": "ScrumCraft" },
          "552638790": { "site": "scrumcraftacademy.com",    "name": "scrumcraftacademy.com",     "brand": "ScrumCraft Academy" },
          "552648392": { "site": "scrumcraftacademy.com.au", "name": "scrumcraftacademy.com.au",  "brand": "ScrumCraft Academy" },
          "497876700": { "site": "academy-learnworlds",      "name": "Academy (LearnWorlds)",     "brand": "ScrumCraft Academy" },
          "538155047": { "site": "thinkwithclarity.com.au",  "name": "thinkwithclarity.com.au",   "brand": "Clarity" },
          "552652741": { "site": "remarkabletalent.com.au",  "name": "remarkabletalent.com.au",   "brand": "Remarkable Talent" }
        }
      }'::jsonb
  where id = 'ga4';

-- ─── Strategy docs (Confluence) fed to the loop as context ───────────────────
create table public.strategy_docs (
  page_id     text primary key,                   -- Confluence page id
  title       text not null,
  url         text not null,
  kind        text not null check (kind in ('marketing_strategy', 'product_strategy', 'brand_guide')),
  content     text,                               -- plain text / markdown; null until first refresh
  version     int,
  fetched_at  timestamptz,
  active      boolean not null default true,
  sort_order  int not null default 0
);
alter table public.strategy_docs enable row level security;

insert into public.strategy_docs (page_id, title, url, kind, sort_order) values
  ('572915713', 'Marketing Strategy',                              'https://scrumcraft.atlassian.net/wiki/spaces/STS/pages/572915713', 'marketing_strategy', 10),
  ('512163872', 'SCA Edge (Public) - Product Marketing Strategy',  'https://scrumcraft.atlassian.net/wiki/spaces/STS/pages/512163872', 'product_strategy',   20),
  ('501874689', 'SCA Forge (Private) - Product Marketing Strategy','https://scrumcraft.atlassian.net/wiki/spaces/STS/pages/501874689', 'product_strategy',   21),
  ('512294949', 'SCA Spark (Self-Pace) - Product Marketing Strategy','https://scrumcraft.atlassian.net/wiki/spaces/STS/pages/512294949', 'product_strategy', 22),
  ('88768513',  'ScrumCraft Brand Guide',                          'https://scrumcraft.atlassian.net/wiki/spaces/STS/pages/88768513',  'brand_guide',        30);
