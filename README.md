# ScrumCraft Marketing Loop

One internal dashboard for ScrumCraft's marketing metrics, plus an automated daily
**PDCA (Plan → Do → Check → Act)** improvement loop that can also be run on demand.

- **Stack:** Next.js 16 (App Router) · shadcn/ui · Tailwind 4 · Supabase (Postgres) · Anthropic (Claude) · Vercel
- **Hosting:** Vercel team `scrumcraft`, protected by Vercel SSO (internal only)
- **Repo:** `ScrumCraftAU/ScrumCraft-Marketing-Loop` (source of truth)

## How the loop works

| Phase | Who | What happens |
|---|---|---|
| **Check** | loop (code) | Compute week-over-week stats for every metric: this week vs last week vs the 4-week average; rule-flag big moves. Running experiments past their check date move to `checking`. |
| **Check** | loop (Claude) | Explain what materially changed, and link leading indicators to the lagging outcomes they predict. |
| **Act** | loop → team | Claude recommends adopt / adapt / abandon / keep running for each experiment under review. **The team makes the call** on the Experiments board. |
| **Plan** | loop → team | Claude proposes new experiments only into free Plan slots (WIP limit: 3 each in Plan, Do and Check), each with a falsifiable hypothesis and one target metric. They land as `proposed`. |
| **Do** | team | Approve (this creates a Jira story in SCM under SCM-123), then start the experiment (it moves to `running`, with a start date). |

Triggers:
- **On demand:** the "Run loop now" button (server action, `runLoopNow`).
- **Jira sync:** each experiment links to one primary Jira item (`experiments.jira_key`). Moving it on the board transitions the Jira item first; moving the Jira item moves the experiment the next time the board loads or the loop runs. Jira To Do (Backlog, Ready To Do) = Plan, anything that has left To Do (Planning, In Progress) = Do, In Review = Check, Done = Check (the build is finished, so the result is now measured and the team decides adopt / adapt / abandon on the board; a decided experiment is never pulled back), Close = Act (abandoned). Act decisions never reopen or close a Jira item that is already Done. Linked experiments only change column when their Jira item does. Uses the Confluence Atlassian credentials unless `JIRA_EMAIL` / `JIRA_API_TOKEN` are set.
- **Daily:** Vercel Cron calls `GET /api/loop/cron` with `Authorization: Bearer $CRON_SECRET` at 21:30 UTC (8:00am Adelaide in daylight time, 7:00am in standard time), after the 6:30am GA4 ingest. Monday's run feeds the weekly review; Wednesday's feeds backlog refinement.

Stats are computed deterministically in code (`src/lib/metrics/stats.ts`). Claude only receives weekly aggregates (`src/lib/loop/analyse.ts`), and the snapshot it saw is stored on each `loop_runs` row for audit.
It also receives **breakdowns** (`src/lib/metrics/breakdowns.ts`): deals, revenue and pipeline by deal source, lost deals by reason,
Academy sales by course, GA4 sessions by channel and Search Console by page (top 10 each), summed over the last 7 and 90 days, or the
latest snapshot for open pipeline. Deals are lumpy, so sources are judged on the 90-day view.

## Data model (`supabase/migrations/0001_initial.sql`)

```
sources ──< metrics ──< metric_observations >── raw_events
                 │
loop_runs ──< loop_findings ──> experiments
     └───────────────< experiments (created_by_run_id)
```

| Table | Purpose |
|---|---|
| `sources` | GA4, HubSpot, LinkedIn Ads, Meta Ads, Ticket Tailor, SEO: ingest method, last sync, last error |
| `metrics` | The catalog: key, funnel stage, **leading/lagging**, unit, direction (up/down is good), aggregation, optional `formula` for derived metrics, target, north-star flag |
| `raw_events` | Every webhook payload kept as received (replay/debug) |
| `metric_observations` | One value per `(metric_key, date, dimension)`; `dimension = ''` is the total, otherwise a campaign, course or keyword. Upserts make re-sends idempotent. |
| `loop_runs` | Each PDCA run: trigger, status, data window, summary, model, token usage, input snapshot |
| `loop_findings` | Check/Act output: anomaly, trend, target gap, win, risk, experiment result, recommendation (severity info/watch/alert) |
| `experiments` | The PDCA board: hypothesis, action, target metric, baseline, expected change, check date, status, result |
| `strategy_docs` | Confluence pages (marketing strategy, SCA product marketing strategies, brand guide) the loop reads as context. Refreshed from the Metrics & sources page. |

Derived metrics (`paid.spend`, `paid.cost_per_booking`, `paid.roas`, …) are **not stored**. They're computed per window as a ratio of sums, which avoids averaging daily ratios.

**Security (differs from Bid Hound):** Bid Hound used open anon RLS policies. The anon key is public and bypasses Vercel SSO, so this app instead enables RLS on every table with **no policies**. All reads and writes happen server-side with the Supabase **secret** key, and nothing is `NEXT_PUBLIC_`.

## Metric catalog

★ = north star. Percentages are stored as fractions.

### Leading indicators: can be moved this week
| Stage | Metric | Key | Source |
|---|---|---|---|
| Awareness | Website sessions | `ga4.sessions` | GA4 |
| Awareness | Organic search sessions | `ga4.organic_sessions` | GA4 |
| Awareness | New users | `ga4.new_users` | GA4 |
| Awareness | LinkedIn impressions | `linkedin_ads.impressions` | LinkedIn Ads |
| Awareness | Meta impressions | `meta_ads.impressions` | Meta Ads |
| Awareness | Search clicks / impressions | `gsc.clicks`, `gsc.impressions` | Search Console (via GA4) |
| Awareness | Search CTR / avg. position (lower is better) | `gsc.ctr`, `gsc.avg_position` | derived |
| Awareness | Course page search clicks / impressions / position | `gsc.course_clicks`, `gsc.course_impressions`, `gsc.course_avg_position` | Search Console / derived |
| Engagement | Engagement rate | `ga4.engagement_rate` | GA4 |
| Engagement | Course page views | `ga4.course_page_views` | GA4 |
| Engagement | LinkedIn clicks / Meta clicks | `linkedin_ads.clicks`, `meta_ads.clicks` | Ads |
| Engagement | Marketing emails sent / opens / clicks | `hubspot.emails_sent`, `hubspot.email_opens`, `hubspot.email_clicks` | HubSpot |
| Engagement | Email open rate / click rate | `hubspot.email_open_rate`, `hubspot.email_click_rate` | derived |
| Engagement | Paid CTR (blended) | `paid.ctr` | derived |
| Conversion | Form submissions | `ga4.form_submits` | GA4 |
| Conversion | Checkout page views | `ga4.checkout_views` | GA4 |
| Conversion | New contacts | `hubspot.new_contacts` | HubSpot |
| Conversion | MQLs (target ≥ 30 a quarter) | `hubspot.mqls` | HubSpot |
| Conversion | MQL-to-SQL rate (target 25%) | `hubspot.mql_to_sql_rate` | derived |
| Conversion | Academy enrolments (new LearnWorlds learners, by course) | `hubspot.academy_enrolments` | HubSpot |
| Conversion | Free course sign-ups | `ticket_tailor.free_signups` | Ticket Tailor |
| Conversion | LinkedIn lead-gen leads | `linkedin_ads.leads` | LinkedIn Ads |

### Lagging indicators: the outcomes
| Stage | Metric | Key | Source |
|---|---|---|---|
| Conversion | SQLs | `hubspot.sqls` | HubSpot |
| Conversion | Course bookings (orders) | `ticket_tailor.orders` | Ticket Tailor |
| Conversion | Seats sold | `ticket_tailor.tickets` | Ticket Tailor |
| Conversion | Academy sales (paid, by course) | `learnworlds.sales` | LearnWorlds |
| Conversion | Upcoming course fill rate | `ticket_tailor.fill_rate` | Ticket Tailor |
| Conversion | Checkout-to-booking rate | `checkout.conversion` | derived |
| Revenue | Booking revenue | `ticket_tailor.revenue` | Ticket Tailor |
| Revenue | Academy revenue (by course) | `learnworlds.revenue` | LearnWorlds |
| Revenue | Deals created / deals won | `hubspot.deals_created`, `hubspot.deals_won` | HubSpot |
| Revenue | Closed-won revenue | `hubspot.won_revenue` | HubSpot |
| Revenue | ★ Marketing-sourced revenue: bookings + closed-won + Academy (target $1.2m a year, $100k a month) | `marketing.revenue` | derived |
| Revenue | LinkedIn / Meta / total paid spend | `linkedin_ads.spend`, `meta_ads.spend`, `paid.spend` | Ads / derived |
| Revenue | Cost per lead | `paid.cost_per_lead` | derived |
| Revenue | Cost per booking | `paid.cost_per_booking` | derived |
| Revenue | ROAS | `paid.roas` | derived |

Retired: `seo.keywords_top10` and `seo.avg_position` (Semrush, replaced by `gsc.*` on 13 Oct 2026; Semrush is kept for research only).

### Definitions and targets

Funnel stages (Subscriber → Lead → MQL → SQL → Opportunity → Customer), the MQL rule and the deal stages are defined in Confluence: **Lead & Deal Stage Definitions** (STS page 633274369, owner Operations, changes approved by Jason at the weekly Marketing Measurement Review). Company and product targets live on the **Operations Role Comparison Map** (page 290357264) and strategic goals in Jira Goals. Only the marketing-funnel targets are stored here (`metrics.target_value`, migration 0015). When a HubSpot definition changes, update the matching metric in the same change.

## Ingesting data (Zapier and other push sources)

**GA4** is one daily Zap that forwards raw GA4 reports for 7 properties. Setup: [docs/ga4-zap.md](docs/ga4-zap.md).
The main site (www.scrumcraft.com) feeds the dashboard totals, and the other properties are stored under
`site:<name>` dimensions and shown in the Web properties table. Search Console clicks, impressions and position
arrive through the same Zap (a branch for the main property only) as `gsc.*` metrics. GA4 rejects Search Console
metrics with `date`, so that request asks for 20 named single-day ranges (`2daysAgo`…`21daysAgo`).

**HubSpot**, **Ticket Tailor** and **LearnWorlds** (ScrumCraft Academy) are pulled by the app itself at the start of each daily loop run (and by "Pull now" on
Metrics & sources), using `HUBSPOT_ACCESS_TOKEN`, `TICKET_TAILOR_API_KEY` and `LEARNWORLDS_SCHOOL_URL` / `LEARNWORLDS_CLIENT_ID` /
`LEARNWORLDS_CLIENT_SECRET` (client-credentials token per pull). LearnWorlds counts paid, non-refunded payments and leaves out
"Added by admin" enrolments, which are usually invoiced and already a HubSpot deal.
**Each sale is recorded in one place** (agreed 18 and 20 Oct 2026): public instructor-led courses in Ticket Tailor,
self-paced courses in LearnWorlds (no HubSpot deal added by hand), private instructor-led courses and contract work as
HubSpot deals. The two deals that were (`EXCLUDED_DEALS` in `src/lib/ingest/hubspot.ts`) are left out of every HubSpot deal metric. Days are Adelaide days; the first pull
backfills 42 days (LearnWorlds: a year), later pulls refresh the last 14. HubSpot also has a one-off
**Backfill a year** button (shown until about a year of history is stored). Other sources use the generic format below.

```
POST /api/ingest/<source>            # source = ga4 | linkedin_ads | meta_ads | hubspot | ticket_tailor | seo
x-ingest-secret: $INGEST_SECRET
x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET   # required while SSO protection is on

{ "date": "2026-09-27", "sessions": 412, "organic_sessions": 180 }
```

Metric names can be short (`sessions`) or full (`ga4.sessions`). You can also send
`{ "date", "dimension", "metrics": { … } }` or an array of rows. The response lists
`stored` and any `unknown` names. Re-sending the same date overwrites the earlier value.

## Local development

```bash
cp .env.example .env.local   # fill in Supabase + Anthropic
npm install
npm run dev                  # http://localhost:3000
npm run typecheck && npm run lint && npm run build
```

With no Supabase env set, every page renders a "not connected" state.

## Roadmap

1. Supabase project + apply migration; Vercel project linked to this repo with SSO + env vars
2. Wire GA4 via Zapier → `/api/ingest/ga4`
3. ✅ HubSpot + Ticket Tailor pulls (run at the start of each daily loop → same observation table)
4. LinkedIn / Meta ads via Zapier; SEO via Search Console through the GA4 link (`gsc.*`). Semrush is kept
   for competitor and keyword research only, not as a feed
5. Schedule the daily loop (Vercel Cron) and add a morning digest (email/Teams)
6. ✅ Funnel targets set (MQLs, MQL-to-SQL, revenue); still to add: win rate and pipeline coverage (need closed-lost and open deal value in the HubSpot pull)
7. Attribute visits and enrolments to the page and button that sent them (GA4 UTM report, SCM-204)
