-- Organic Instagram for @scrumcraftau, 7 Nov 2026. The same route as LinkedIn organic: a daily Claude
-- task reads the HubSpot connector and passes the posts to this function. HubSpot reports no shares
-- for these posts, so there's no shares metric.

insert into public.sources (id, name, ingest_method, enabled) values
  ('instagram_organic', 'Instagram organic', 'claude_task', false);

insert into public.metrics
  (key, name, description, source_id, funnel_stage, indicator, unit, direction, aggregation, formula, is_north_star, sort_order, active, target_value, target_period) values
  ('instagram_organic.posts',       'Instagram posts',       'Organic posts on @scrumcraftau, by day posted',                                                           'instagram_organic', 'awareness',  'leading', 'count', 'up_good', 'sum', null, false, 12, true, null, null),
  ('instagram_organic.impressions', 'Instagram impressions (organic)', 'Impressions on organic posts, counted on the day posted and updated as posts age',                'instagram_organic', 'awareness',  'leading', 'count', 'up_good', 'sum', null, false, 12, true, null, null),
  ('instagram_organic.likes',       'Instagram likes',       'Likes on organic posts, counted on the day posted and updated as posts age',                              'instagram_organic', 'engagement', 'leading', 'count', 'up_good', 'sum', null, false, 21, true, null, null),
  ('instagram_organic.comments',    'Instagram comments',    'Comments on organic posts, counted on the day posted and updated as posts age',                           'instagram_organic', 'engagement', 'leading', 'count', 'up_good', 'sum', null, false, 21, true, null, null);

-- p_posts: the posts array from get_social_post_analytics, every page, covering p_from to p_to.
-- Replaces that date range. Posting is infrequent, so an empty list is valid and stores zeros. The
-- daily task must confirm the channel is active before passing one, as a disconnected channel also
-- returns no posts. A count HubSpot doesn't report is left out, never stored as 0.
create function public.ingest_instagram_posts(p_posts jsonb, p_from date, p_to date)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_event uuid;
  v_rows int;
begin
  if jsonb_typeof(p_posts) is distinct from 'array' then
    raise exception 'ingest_instagram_posts needs a list of posts, nothing was changed';
  end if;

  insert into raw_events (source_id, payload, processed_at)
  values ('instagram_organic', jsonb_build_object('days', jsonb_build_array(p_from, p_to), 'posts', p_posts), now())
  returning id into v_event;

  delete from metric_observations where metric_key like 'instagram_organic.%' and date between p_from and p_to;

  with kept as (
    select ((p->>'publishAt')::timestamptz at time zone 'Australia/Adelaide')::date as day,
           'post:' || coalesce(substring(p->>'url' from '/p/([^/]+)'), p->>'postKey') as post,
           coalesce(p->'stats', '{}'::jsonb) as stats
    from jsonb_array_elements(p_posts) p
  ), stat as (
    select day, post, 'posts' as name, 1::numeric as value
    from kept where day between p_from and p_to
    union all
    select k.day, k.post, s.key, (s.value #>> '{}')::numeric
    from kept k cross join lateral jsonb_each(k.stats) s
    where k.day between p_from and p_to and s.key in ('impressions', 'likes', 'comments')
  ), zeros as (
    select d::date as day, n as name
    from generate_series(p_from, p_to, interval '1 day') d
    cross join unnest(array['posts', 'impressions', 'likes', 'comments']) n
  ), rows as (
    select name, day, '' as dimension, sum(value) as value
    from (select name, day, value from stat union all select name, day, 0 from zeros) t
    group by name, day
    union all
    select name, day, post, sum(value) from stat group by name, day, post
  )
  insert into metric_observations (metric_key, date, dimension, value, raw_event_id)
  select 'instagram_organic.' || name, day, dimension, value, v_event from rows;
  get diagnostics v_rows = row_count;

  update sources set enabled = true, last_synced_at = now(), last_error = null where id = 'instagram_organic';
  return jsonb_build_object('stored', v_rows, 'posts', jsonb_array_length(p_posts));
end $$;

revoke all on function public.ingest_instagram_posts(jsonb, date, date) from public, anon, authenticated;
