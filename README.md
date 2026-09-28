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
| **Plan** | loop → team | Claude proposes at most 3 new experiments, each with a falsifiable hypothesis and one target metric. They land as `proposed`. |
| **Do** | team | Approve, then start the experiment (it moves to `running`, with a start date). |

Triggers:
- **On demand:** the "Run loop now" button (server action, `runLoopNow`).
- **Daily:** `GET /api/loop/cron` with `Authorization: Bearer $CRON_SECRET`. This isn't scheduled yet; add a `crons` entry to `vercel.json` when we're ready.

Stats are computed deterministically in code (`src/lib/metrics/stats.ts`). Claude only receives weekly aggregates (`src/lib/loop/analyse.ts`), and the snapshot it saw is stored on each `loop_runs` row for audit.

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
| Awareness | Keywords in top 10 | `seo.keywords_top10` | SEO |
| Awareness | Avg. tracked position (lower is better) | `seo.avg_position` | SEO |
| Engagement | Engagement rate | `ga4.engagement_rate` | GA4 |
| Engagement | Course page views | `ga4.course_page_views` | GA4 |
| Engagement | LinkedIn clicks / Meta clicks | `linkedin_ads.clicks`, `meta_ads.clicks` | Ads |
| Engagement | Email click rate | `hubspot.email_click_rate` | HubSpot |
| Engagement | Paid CTR (blended) | `paid.ctr` | derived |
| Conversion | Form submissions | `ga4.form_submits` | GA4 |
| Conversion | Checkout page views | `ga4.checkout_views` | GA4 |
| Conversion | New contacts | `hubspot.new_contacts` | HubSpot |
| Conversion | MQLs | `hubspot.mqls` | HubSpot |
| Conversion | LinkedIn lead-gen leads | `linkedin_ads.leads` | LinkedIn Ads |

### Lagging indicators: the outcomes
| Stage | Metric | Key | Source |
|---|---|---|---|
| Conversion | SQLs | `hubspot.sqls` | HubSpot |
| Conversion | Course bookings (orders) | `ticket_tailor.orders` | Ticket Tailor |
| Conversion | Seats sold | `ticket_tailor.tickets` | Ticket Tailor |
| Conversion | Upcoming course fill rate | `ticket_tailor.fill_rate` | Ticket Tailor |
| Revenue | Booking revenue | `ticket_tailor.revenue` | Ticket Tailor |
| Revenue | Deals created | `hubspot.deals_created` | HubSpot |
| Revenue | Closed-won revenue | `hubspot.won_revenue` | HubSpot |
| Revenue | ★ Marketing-sourced revenue | `marketing.revenue` | derived |
| Revenue | LinkedIn / Meta / total paid spend | `linkedin_ads.spend`, `meta_ads.spend`, `paid.spend` | Ads / derived |
| Revenue | Cost per lead | `paid.cost_per_lead` | derived |
| Revenue | Cost per booking | `paid.cost_per_booking` | derived |
| Revenue | ROAS | `paid.roas` | derived |

## Ingesting data (Zapier and other push sources)

**GA4** is one daily Zap that forwards raw GA4 reports for 7 properties. Setup: [docs/ga4-zap.md](docs/ga4-zap.md).
The main site (www.scrumcraft.com) feeds the dashboard totals, and the other properties are stored under
`site:<name>` dimensions and shown in the Web properties table. Other sources use the generic format below.

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
3. HubSpot + Ticket Tailor pulls (scheduled route handlers → same observation table)
4. LinkedIn / Meta ads via Zapier; SEO via Semrush position tracking
5. Schedule the daily loop (Vercel Cron) and add a morning digest (email/Teams)
6. Set targets per metric so the loop can report target gaps
