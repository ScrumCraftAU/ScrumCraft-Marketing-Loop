@AGENTS.md

# ScrumCraft Marketing Loop — project notes

- See README.md for the PDCA loop, data model and metric catalog.
- All Supabase access is server-only via `db()` in `src/lib/supabase/server.ts` (secret key).
  RLS is on with no policies — never add anon policies or `NEXT_PUBLIC_SUPABASE_*` keys.
- Schema changes: add a new numbered file in `supabase/migrations/`, never edit an applied one.
- New metrics: insert into `metrics` via a migration; derived metrics use `formula`
  (metric keys with + - * / and parentheses, see `src/lib/metrics/formula.ts`).
- Verify with `npm run typecheck && npm run lint && npm run build`.

## Brand (source of truth: Confluence "ScrumCraft Brand Guide", approvals by Jason)
- Colours come only from the tokens in `src/app/globals.css` (`primary`, `cta`, `good`, `bad`,
  `muted-foreground`, …). Never black; no Tailwind default palette; no hex outside globals.css.
  `npm test` enforces this (`src/lib/brand.test.ts`).
- Text is brand Purple `#3e225c`; secondary text `#6b5a80`. Turquoise/Orange/Cherry are fills only
  (too low-contrast for text). CTA buttons: `variant="cta"` (Bright Cyan, purple text).
- Font: Red Hat Display only — `font-black` page titles, `font-bold` headings, regular body.
- Light theme only. Copy is supportive, plain English, no negative framing.
