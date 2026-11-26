-- Make marketing-sourced revenue genuinely marketing-sourced (26 Nov 2026).
--
-- The formula summed all HubSpot closed-won revenue, but every won deal in the data is non-marketing
-- (repeat and expansion, or outbound sourced through Cognism), so the metric read as mostly sales-led
-- revenue and the $30k marketing target was passed on work marketing did not drive. Drop closed-won and
-- keep the self-serve channels marketing actually drives, public course bookings (Ticket Tailor) and
-- Academy sales (LearnWorlds). If HubSpot starts winning inbound or marketing-attributed deals, add a
-- source-filtered closed-won input (e.g. hubspot.won_revenue_marketing) rather than the whole total.
update public.metrics
set formula = 'ticket_tailor.revenue + learnworlds.revenue',
    description = 'Self-serve, marketing-driven revenue. Public course bookings (Ticket Tailor) plus Academy sales (LearnWorlds). Excludes HubSpot closed-won, which is sales-led (repeat and expansion, outbound), not marketing-sourced.'
where key = 'marketing.revenue';
