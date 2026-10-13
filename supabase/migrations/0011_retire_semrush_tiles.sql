-- SCM-170 criterion 3 (Jason, 13 Oct 2026): Semrush is kept for competitor and keyword research
-- only, not as a dashboard feed. Search Console (gsc.*, migration 0010) replaces its tiles.
update public.metrics
  set active = false, description = description || ' (retired 13 Oct 2026: replaced by gsc.* metrics)'
  where key in ('seo.keywords_top10', 'seo.avg_position');
