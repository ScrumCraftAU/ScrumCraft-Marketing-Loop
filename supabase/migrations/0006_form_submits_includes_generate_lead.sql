-- The contact form is an embedded HubSpot form, which GA4 Enhanced measurement can't
-- detect, so enquiries are recorded as generate_lead (thank-you page custom event or a
-- Tag Manager listener). ga4.form_submits now counts both event names.
update public.metrics
  set description = 'Enquiries: GA4 form_submit + generate_lead events (HubSpot forms need generate_lead)'
  where key = 'ga4.form_submits';
