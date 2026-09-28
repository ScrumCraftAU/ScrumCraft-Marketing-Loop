@AGENTS.md

# ScrumCraft Marketing Loop — project notes

- See README.md for the PDCA loop, data model and metric catalog.
- All Supabase access is server-only via `db()` in `src/lib/supabase/server.ts` (secret key).
  RLS is on with no policies — never add anon policies or `NEXT_PUBLIC_SUPABASE_*` keys.
- Schema changes: add a new numbered file in `supabase/migrations/`, never edit an applied one.
- New metrics: insert into `metrics` via a migration; derived metrics use `formula`
  (metric keys with + - * / and parentheses, see `src/lib/metrics/formula.ts`).
- Verify with `npm run typecheck && npm run lint && npm run build`.
