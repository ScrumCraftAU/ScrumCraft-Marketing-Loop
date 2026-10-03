-- Main site switches to GA4 property 552676870 ("scrumcraft.com", ScrumCraft account,
-- Adelaide/AUD, stream G-CJDDMN02SK via Tag Manager). Decision: Jason, 2026-10-03.
--
-- 317178274 ("www.scrumcraft.com - GA4", Ads Analytics account, stream G-N3SL34FSQ2 via
-- Site Kit) is retired. Its rows stay as the main-site history: dates before 2026-09-03
-- (when 552676870 was created) are untouched; from 3 Sep onwards the next Zap run for
-- 552676870 upserts over them. Expect a level shift: since 3 Sep the new property records
-- ~30% fewer sessions and no conversion events until Enhanced measurement / key events
-- are fixed in GA4.

update public.sources
  set config = jsonb_set(
        jsonb_set(config,
          '{properties,552676870}',
          '{"site": null, "name": "scrumcraft.com", "brand": "ScrumCraft"}'),
        '{properties,317178274}',
        '{"site": "legacy-www.scrumcraft.com", "name": "www.scrumcraft.com (legacy GA4, retired)", "brand": "ScrumCraft", "retired": true}')
  where id = 'ga4';
