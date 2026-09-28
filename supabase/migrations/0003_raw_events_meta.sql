-- Record request context (e.g. the GA4 property a request claims to be) and make
-- duplicate-payload checks cheap, so a Zap that re-sends a stale sample is caught.
alter table public.raw_events add column meta jsonb not null default '{}'::jsonb;
create index raw_events_payload_hash_idx on public.raw_events (source_id, md5(payload::text));
