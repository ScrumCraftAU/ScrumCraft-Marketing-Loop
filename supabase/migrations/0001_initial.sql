-- ScrumCraft Marketing Loop — initial schema.
--
-- Security model: the app is gated by Vercel SSO and talks to Supabase only from
-- the server using the secret key. RLS is enabled on every table with NO policies,
-- so the public anon/publishable key can read or write nothing. (Bid Hound used open
-- anon policies; we deliberately do not, because the anon key bypasses Vercel SSO.)

-- ─── Sources ──────────────────────────────────────────────────────────────────
create table public.sources (
  id             text primary key,                -- 'ga4', 'hubspot', ...
  name           text not null,
  ingest_method  text not null check (ingest_method in ('zapier_webhook', 'api_pull', 'manual')),
  enabled        boolean not null default false,
  last_synced_at timestamptz,
  last_error     text,
  config         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- ─── Metric catalog ───────────────────────────────────────────────────────────
create table public.metrics (
  key            text primary key,                -- 'ga4.sessions'
  name           text not null,
  description    text not null default '',
  source_id      text references public.sources(id),  -- null for derived metrics
  funnel_stage   text not null check (funnel_stage in ('awareness', 'engagement', 'conversion', 'revenue')),
  indicator      text not null check (indicator in ('leading', 'lagging')),
  unit           text not null check (unit in ('count', 'aud', 'percent', 'ratio', 'position')),
  direction      text not null check (direction in ('up_good', 'down_good')),
  aggregation    text not null check (aggregation in ('sum', 'avg', 'last')),
  formula        text,                            -- derived: e.g. 'paid.spend / ticket_tailor.orders'
  target_value   numeric,
  target_period  text check (target_period in ('week', 'month')),
  is_north_star  boolean not null default false,
  sort_order     int not null default 0,
  active         boolean not null default true
);

-- ─── Raw landing zone (Zapier webhooks, API pulls) ────────────────────────────
create table public.raw_events (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null references public.sources(id),
  received_at   timestamptz not null default now(),
  payload       jsonb not null,
  processed_at  timestamptz,
  error         text
);
create index raw_events_unprocessed_idx on public.raw_events (source_id, received_at) where processed_at is null;

-- ─── Daily observations (one row per metric/day/dimension) ────────────────────
create table public.metric_observations (
  id            bigint generated always as identity primary key,
  metric_key    text not null references public.metrics(key) on delete cascade,
  date          date not null,
  dimension     text not null default '',          -- '' = total; else campaign/event/keyword
  value         numeric not null,
  raw_event_id  uuid references public.raw_events(id) on delete set null,
  ingested_at   timestamptz not null default now(),
  unique (metric_key, date, dimension)
);
create index metric_observations_date_idx on public.metric_observations (date desc);

-- ─── PDCA: loop runs ──────────────────────────────────────────────────────────
create table public.loop_runs (
  id            uuid primary key default gen_random_uuid(),
  trigger       text not null check (trigger in ('scheduled', 'manual')),
  triggered_by  text,                              -- email / 'vercel-cron'
  status        text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  period_start  date not null,
  period_end    date not null,
  summary       text,                              -- headline narrative
  model         text,
  input_snapshot jsonb,                            -- stats fed to the model (for audit/replay)
  usage         jsonb,
  error         text
);
create index loop_runs_started_idx on public.loop_runs (started_at desc);

-- ─── PDCA: findings (Check + Act output of each run) ──────────────────────────
create table public.loop_findings (
  id            uuid primary key default gen_random_uuid(),
  loop_run_id   uuid not null references public.loop_runs(id) on delete cascade,
  phase         text not null check (phase in ('check', 'act')),
  kind          text not null check (kind in ('anomaly', 'trend', 'target_gap', 'win', 'risk', 'experiment_result', 'recommendation')),
  severity      text not null default 'info' check (severity in ('info', 'watch', 'alert')),
  metric_key    text references public.metrics(key) on delete set null,
  experiment_id uuid,
  title         text not null,
  detail        text not null default '',
  evidence      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index loop_findings_run_idx on public.loop_findings (loop_run_id);

-- ─── PDCA: experiments (Plan → Do → Check → Act) ──────────────────────────────
create table public.experiments (
  id                  uuid primary key default gen_random_uuid(),
  created_by_run_id   uuid references public.loop_runs(id) on delete set null,
  title               text not null,
  hypothesis          text not null,               -- "If we X, then metric Y moves Z because W"
  action              text not null default '',    -- what the team will actually do
  target_metric_key   text references public.metrics(key) on delete set null,
  baseline_value      numeric,
  expected_change_pct numeric,
  owner               text,
  status              text not null default 'proposed'
                        check (status in ('proposed', 'approved', 'running', 'checking', 'adopted', 'adapted', 'abandoned', 'rejected')),
  start_date          date,
  check_date          date,
  result_value        numeric,
  result_notes        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.loop_findings
  add constraint loop_findings_experiment_fk foreign key (experiment_id) references public.experiments(id) on delete set null;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger experiments_touch before update on public.experiments
  for each row execute function public.touch_updated_at();

-- ─── RLS: on everywhere, no policies (server-only access via secret key) ─────
alter table public.sources             enable row level security;
alter table public.metrics             enable row level security;
alter table public.raw_events          enable row level security;
alter table public.metric_observations enable row level security;
alter table public.loop_runs           enable row level security;
alter table public.loop_findings       enable row level security;
alter table public.experiments         enable row level security;

-- ─── Seed: sources ────────────────────────────────────────────────────────────
insert into public.sources (id, name, ingest_method) values
  ('ga4',           'Google Analytics 4',   'zapier_webhook'),
  ('hubspot',       'HubSpot',              'api_pull'),
  ('linkedin_ads',  'LinkedIn Ads',         'zapier_webhook'),
  ('meta_ads',      'Meta / Instagram Ads', 'zapier_webhook'),
  ('ticket_tailor', 'Ticket Tailor',        'api_pull'),
  ('seo',           'SEO / Rank tracking',  'api_pull');

-- ─── Seed: metric catalog ─────────────────────────────────────────────────────
insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order) values
-- Awareness (leading)
  ('ga4.sessions',            'Website sessions',          'All GA4 sessions',                                   'ga4',          'awareness',  'leading', 'count',    'up_good',   'sum',  null, false, 10),
  ('ga4.organic_sessions',    'Organic search sessions',   'Sessions from organic search',                       'ga4',          'awareness',  'leading', 'count',    'up_good',   'sum',  null, false, 11),
  ('ga4.new_users',           'New users',                 'First-time visitors',                                'ga4',          'awareness',  'leading', 'count',    'up_good',   'sum',  null, false, 12),
  ('linkedin_ads.impressions','LinkedIn impressions',      null,                                                 'linkedin_ads', 'awareness',  'leading', 'count',    'up_good',   'sum',  null, false, 13),
  ('meta_ads.impressions',    'Meta impressions',          'Facebook + Instagram',                               'meta_ads',     'awareness',  'leading', 'count',    'up_good',   'sum',  null, false, 14),
  ('seo.keywords_top10',      'Keywords in top 10',        'Tracked keywords ranking positions 1–10',           'seo',          'awareness',  'leading', 'count',    'up_good',   'last', null, false, 15),
  ('seo.avg_position',        'Avg. tracked position',     'Mean Google position across tracked keywords',       'seo',          'awareness',  'leading', 'position', 'down_good', 'last', null, false, 16),
-- Engagement (leading)
  ('ga4.engagement_rate',     'Engagement rate',           'Engaged sessions / sessions',                        'ga4',          'engagement', 'leading', 'percent',  'up_good',   'avg',  null, false, 20),
  ('ga4.course_page_views',   'Course page views',         'Views of public course / event pages',               'ga4',          'engagement', 'leading', 'count',    'up_good',   'sum',  null, false, 21),
  ('linkedin_ads.clicks',     'LinkedIn clicks',           null,                                                 'linkedin_ads', 'engagement', 'leading', 'count',    'up_good',   'sum',  null, false, 22),
  ('meta_ads.clicks',         'Meta clicks',               null,                                                 'meta_ads',     'engagement', 'leading', 'count',    'up_good',   'sum',  null, false, 23),
  ('hubspot.email_click_rate','Email click rate',          'Marketing email clicks / delivered',                 'hubspot',      'engagement', 'leading', 'percent',  'up_good',   'avg',  null, false, 24),
  ('paid.ctr',                'Paid CTR (blended)',        'LinkedIn + Meta clicks / impressions',               null,           'engagement', 'leading', 'percent',  'up_good',   'avg',  '(linkedin_ads.clicks + meta_ads.clicks) / (linkedin_ads.impressions + meta_ads.impressions)', false, 25),
-- Conversion (leading → lagging)
  ('ga4.key_events',          'GA4 key events',            'Enquiry forms, brochure downloads, checkout starts', 'ga4',          'conversion', 'leading', 'count',    'up_good',   'sum',  null, false, 30),
  ('hubspot.new_contacts',    'New contacts',              'Contacts created in HubSpot',                        'hubspot',      'conversion', 'leading', 'count',    'up_good',   'sum',  null, false, 31),
  ('hubspot.mqls',            'MQLs',                      'Contacts reaching marketing-qualified lead',         'hubspot',      'conversion', 'leading', 'count',    'up_good',   'sum',  null, false, 32),
  ('linkedin_ads.leads',      'LinkedIn lead-gen leads',   'Lead Gen Form submissions',                          'linkedin_ads', 'conversion', 'leading', 'count',    'up_good',   'sum',  null, false, 33),
  ('hubspot.sqls',            'SQLs',                      'Sales-qualified leads',                              'hubspot',      'conversion', 'lagging', 'count',    'up_good',   'sum',  null, false, 34),
  ('ticket_tailor.orders',    'Course bookings (orders)',  'Ticket Tailor orders',                               'ticket_tailor','conversion', 'lagging', 'count',    'up_good',   'sum',  null, false, 35),
  ('ticket_tailor.tickets',   'Seats sold',                'Tickets issued across public courses',               'ticket_tailor','conversion', 'lagging', 'count',    'up_good',   'sum',  null, false, 36),
  ('ticket_tailor.fill_rate', 'Upcoming course fill rate', 'Seats sold / capacity for courses in next 60 days',  'ticket_tailor','conversion', 'lagging', 'percent',  'up_good',   'last', null, false, 37),
-- Revenue & efficiency (lagging)
  ('ticket_tailor.revenue',   'Booking revenue',           'Gross Ticket Tailor revenue (AUD, ex. refunds)',    'ticket_tailor','revenue',    'lagging', 'aud',      'up_good',   'sum',  null, false, 40),
  ('hubspot.deals_created',   'Deals created',             'New B2B deals (coaching / in-house training)',       'hubspot',      'revenue',    'lagging', 'count',    'up_good',   'sum',  null, false, 41),
  ('hubspot.won_revenue',     'Closed-won revenue',        'HubSpot deals closed-won (AUD)',                     'hubspot',      'revenue',    'lagging', 'aud',      'up_good',   'sum',  null, false, 42),
  ('marketing.revenue',       'Marketing-sourced revenue', 'Booking revenue + closed-won revenue',               null,           'revenue',    'lagging', 'aud',      'up_good',   'sum',  'ticket_tailor.revenue + hubspot.won_revenue', true, 43),
  ('linkedin_ads.spend',      'LinkedIn spend',            null,                                                 'linkedin_ads', 'revenue',    'lagging', 'aud',      'down_good', 'sum',  null, false, 44),
  ('meta_ads.spend',          'Meta spend',                null,                                                 'meta_ads',     'revenue',    'lagging', 'aud',      'down_good', 'sum',  null, false, 45),
  ('paid.spend',              'Paid media spend',          'LinkedIn + Meta',                                    null,           'revenue',    'lagging', 'aud',      'down_good', 'sum',  'linkedin_ads.spend + meta_ads.spend', false, 46),
  ('paid.cost_per_lead',      'Cost per lead',             'Paid spend / new contacts',                          null,           'revenue',    'lagging', 'aud',      'down_good', 'avg',  'paid.spend / hubspot.new_contacts', false, 47),
  ('paid.cost_per_booking',   'Cost per booking',          'Paid spend / Ticket Tailor orders',                  null,           'revenue',    'lagging', 'aud',      'down_good', 'avg',  'paid.spend / ticket_tailor.orders', false, 48),
  ('paid.roas',               'ROAS',                      'Booking revenue / paid spend',                       null,           'revenue',    'lagging', 'ratio',    'up_good',   'avg',  'ticket_tailor.revenue / paid.spend', false, 49);
