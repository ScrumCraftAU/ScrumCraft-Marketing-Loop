-- Weighted pipeline now reads HubSpot's "Weighted amount in company currency"
-- (hs_projected_amount_in_home_currency = amount x deal-stage probability). hs_forecast_amount,
-- used in 0017, is the unweighted amount.

update public.metrics
   set description = 'Open deal amount x deal-stage probability (HubSpot weighted amount, AUD, daily snapshot)'
 where key = 'hubspot.weighted_pipeline_value';
