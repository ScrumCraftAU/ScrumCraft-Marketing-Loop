-- LinkedIn organic (SCM-312) and AI visibility (SCM-298), 7 Nov 2026.
-- HubSpot exposes both only through its Claude connector (get_social_post_analytics and
-- get_aeo_metrics), which the Vercel app can't call, and the legacy broadcast API returns no posts.
-- So a daily Claude task reads the connector and passes the results to the two functions below,
-- which do all the counting. Execute is revoked from public, anon and authenticated.

alter table public.sources drop constraint sources_ingest_method_check;
alter table public.sources add constraint sources_ingest_method_check
  check (ingest_method = any (array['zapier_webhook', 'api_pull', 'manual', 'claude_task']));

insert into public.sources (id, name, ingest_method, enabled) values
  ('linkedin_organic', 'LinkedIn organic', 'claude_task', false),
  ('aeo', 'AI visibility (AEO)', 'claude_task', false);

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('linkedin_organic.posts',       'LinkedIn posts',       'Organic posts across the ScrumCraft, Remarkable Talent, Think with Clarity and Jason Cameron pages, by day posted (also by channel)',                'linkedin_organic', 'awareness',  'leading', 'count', 'up_good', 'sum', null, false, 12, true, null, null),
  ('linkedin_organic.impressions', 'LinkedIn impressions (organic)', 'Impressions on organic posts, counted on the day posted and updated as posts age. Company pages only: HubSpot reports none for the personal page (also by channel)', 'linkedin_organic', 'awareness',  'leading', 'count', 'up_good', 'sum', null, false, 12, true, null, null),
  ('linkedin_organic.likes',       'LinkedIn likes',       'Likes on organic posts, counted on the day posted and updated as posts age (also by channel)',                                                       'linkedin_organic', 'engagement', 'leading', 'count', 'up_good', 'sum', null, false, 21, true, null, null),
  ('linkedin_organic.comments',    'LinkedIn comments',    'Comments on organic posts, counted on the day posted and updated as posts age (also by channel)',                                                    'linkedin_organic', 'engagement', 'leading', 'count', 'up_good', 'sum', null, false, 21, true, null, null),
  ('linkedin_organic.shares',      'LinkedIn shares',      'Shares of organic posts, counted on the day posted and updated as posts age. Company pages only (also by channel)',                                  'linkedin_organic', 'engagement', 'leading', 'count', 'up_good', 'sum', null, false, 21, true, null, null),
  ('aeo.visibility',      'AI visibility',          'Share of AI assistant answers that mention ScrumCraft, last 7 days, tracked prompts from 6 Nov 2026 only (daily snapshot, also by stream, persona, assistant and prompt)', 'aeo', 'awareness', 'leading', 'percent', 'up_good', 'last', null, false, 13, true, null, null),
  ('aeo.share_of_voice',  'AI share of voice',      'ScrumCraft share of brand mentions in AI answers, last 7 days (daily snapshot, also by brand)',                                                                          'aeo', 'awareness', 'leading', 'percent', 'up_good', 'last', null, false, 13, true, null, null),
  ('aeo.mentions',        'AI answers mentioning us', 'AI answers that mention ScrumCraft, last 7 days (daily snapshot, also by stream, persona and assistant)',                                                              'aeo', 'awareness', 'leading', 'count',   'up_good', 'last', null, false, 13, true, null, null),
  ('aeo.responses',       'AI answers checked',     'AI answers HubSpot checked, last 7 days (daily snapshot, also by stream, persona and assistant)',                                                                        'aeo', 'awareness', 'leading', 'count',   'up_good', 'last', null, false, 13, true, null, null),
  ('aeo.owned_citations', 'AI citations of our sites', 'Citations of our own sites in AI answers, last 7 days (daily snapshot, also by assistant)',                                                                   'aeo', 'awareness', 'leading', 'count',   'up_good', 'last', null, false, 13, true, null, null);

-- p_posts: the posts array from get_social_post_analytics, every page, covering p_from to p_to.
-- Replaces that date range, so stats refresh as posts age and a deleted post drops out.
-- A count HubSpot doesn't report is left out, never stored as 0.
create function public.ingest_linkedin_posts(p_posts jsonb, p_from date, p_to date)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_event uuid;
  v_rows int;
begin
  if jsonb_typeof(p_posts) is distinct from 'array' or jsonb_array_length(p_posts) = 0 then
    raise exception 'ingest_linkedin_posts needs at least one post, nothing was changed';
  end if;

  insert into raw_events (source_id, payload, processed_at)
  values ('linkedin_organic', jsonb_build_object('days', jsonb_build_array(p_from, p_to), 'posts', p_posts), now())
  returning id into v_event;

  delete from metric_observations where metric_key like 'linkedin_organic.%' and date between p_from and p_to;

  with kept as (
    select ((p->>'publishAt')::timestamptz at time zone 'Australia/Adelaide')::date as day,
           'channel:' || lower(trim(regexp_replace(p->>'channelName', '[^[:alnum:] ]', '', 'g'))) as channel,
           'post:' || coalesce(substring(p->>'url' from 'urn:li:(.+)$'), p->>'postKey') as post,
           coalesce(p->'stats', '{}'::jsonb) as stats
    from jsonb_array_elements(p_posts) p
  ), stat as (
    select day, channel, post, 'posts' as name, 1::numeric as value
    from kept where day between p_from and p_to
    union all
    select k.day, k.channel, k.post, s.key, (s.value #>> '{}')::numeric
    from kept k cross join lateral jsonb_each(k.stats) s
    where k.day between p_from and p_to and s.key in ('impressions', 'likes', 'comments', 'shares')
  ), zeros as (
    select d::date as day, n as name
    from generate_series(p_from, p_to, interval '1 day') d
    cross join unnest(array['posts', 'impressions', 'likes', 'comments', 'shares']) n
  ), rows as (
    select name, day, '' as dimension, sum(value) as value
    from (select name, day, value from stat union all select name, day, 0 from zeros) t
    group by name, day
    union all
    select name, day, channel, sum(value) from stat group by name, day, channel
    union all
    select name, day, post, sum(value) from stat group by name, day, post
  )
  insert into metric_observations (metric_key, date, dimension, value, raw_event_id)
  select 'linkedin_organic.' || name, day, dimension, value, v_event from rows;
  get diagnostics v_rows = row_count;

  update sources set enabled = true, last_synced_at = now(), last_error = null where id = 'linkedin_organic';
  return jsonb_build_object('stored', v_rows, 'posts', jsonb_array_length(p_posts));
end $$;

-- p: { day, summary, prompts, brands, assistants } from get_aeo_metrics sections SUMMARY, PROMPTS,
-- COMPETITORS and ASSISTANT_BREAKDOWN. Replaces that day's snapshot. HubSpot reports percentages two
-- ways: averageVisibility as 21.1 and sharePercent as 0.154. Stored as fractions like other percents.
-- Streams and personas come from each prompt's product and ICP ids. A new id shows as "unmapped".
create function public.ingest_aeo_snapshot(p jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_day date := (p->>'day')::date;
  v_event uuid;
  v_rows int;
begin
  if v_day is null or coalesce(jsonb_array_length(p->'prompts'), 0) = 0 or p->'summary'->>'averageVisibility' is null then
    raise exception 'ingest_aeo_snapshot needs day, summary and prompts, nothing was changed';
  end if;

  insert into raw_events (source_id, payload, processed_at) values ('aeo', p, now()) returning id into v_event;
  delete from metric_observations where metric_key like 'aeo.%' and date = v_day;

  with prompts as (
    select lower(x->>'prompt') as prompt,
           (x->>'mentionCount')::numeric as mentions,
           (x->>'responseCount')::numeric as responses,
           case when x->'productIds'->>0 in ('66011144', '65882729', '65882726', '65882728') then 'consulting'
                when x->'productIds'->>0 = '66011145' then 'talent'
                when x->'productIds'->>0 in ('65882718', '65882720', '66011146', '67463965', '67463910') then 'academy'
                else 'unmapped' end as stream,
           case x->'icpIds'->>0 when '24020318' then 'morgan' when '20150511' then 'alex' when '20150515' then 'sam' else 'unmapped' end as persona
    from jsonb_array_elements(p->'prompts') x
    where coalesce(x->>'trackingStatus', 'TRACKED') = 'TRACKED'
  ), assistants as (
    select lower(x->>'assistant') as assistant,
           (x->>'runsWithMentions')::numeric as mentions,
           (x->>'totalRuns')::numeric as responses,
           (x->>'ownedCitations')::numeric as owned
    from jsonb_array_elements(coalesce(p->'assistants', '[]'::jsonb)) x
  ), brands as (
    select x->>'brandName' as brand, (x->>'sharePercent')::numeric as share
    from jsonb_array_elements(coalesce(p->'brands', '[]'::jsonb)) x
  ), grouped as (
    select 'stream:' || stream as dimension, sum(mentions) as mentions, sum(responses) as responses from prompts group by stream
    union all select 'persona:' || persona, sum(mentions), sum(responses) from prompts group by persona
    union all select 'assistant:' || assistant, mentions, responses from assistants
  ), rows as (
    select 'aeo.visibility' as metric_key, '' as dimension, (p->'summary'->>'averageVisibility')::numeric / 100 as value
    union all select 'aeo.mentions', '', (p->'summary'->>'totalRunsWithMentions')::numeric
    union all select 'aeo.responses', '', (p->'summary'->>'totalResponses')::numeric
    union all select 'aeo.owned_citations', '', sum(owned) from assistants having count(*) > 0
    union all select 'aeo.share_of_voice', '', share from brands where lower(brand) = 'scrumcraft'
    union all select 'aeo.visibility', dimension, mentions / nullif(responses, 0) from grouped where responses > 0
    union all select 'aeo.mentions', dimension, mentions from grouped
    union all select 'aeo.responses', dimension, responses from grouped
    union all select 'aeo.visibility', 'prompt:' || prompt, mentions / nullif(responses, 0) from prompts where responses > 0
    union all select 'aeo.owned_citations', 'assistant:' || assistant, owned from assistants
    union all select 'aeo.share_of_voice', 'brand:' || lower(brand), share from brands
  )
  insert into metric_observations (metric_key, date, dimension, value, raw_event_id)
  select metric_key, v_day, dimension, value, v_event from rows;
  get diagnostics v_rows = row_count;

  update sources set enabled = true, last_synced_at = now(), last_error = null where id = 'aeo';
  return jsonb_build_object('stored', v_rows);
end $$;

revoke all on function public.ingest_linkedin_posts(jsonb, date, date) from public, anon, authenticated;
revoke all on function public.ingest_aeo_snapshot(jsonb) from public, anon, authenticated;
