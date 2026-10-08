-- 'done': an action the team simply implemented (a fix or one-off task) with no test period.
-- Distinct from 'adopted' (an experiment whose result was checked and kept) and from
-- 'rejected' (we chose not to do it). Done items show in the Act column and are passed
-- to the loop as recent decisions so it doesn't propose them again.
alter table public.experiments drop constraint experiments_status_check;
alter table public.experiments add constraint experiments_status_check
  check (status in ('proposed', 'approved', 'running', 'checking', 'adopted', 'adapted', 'abandoned', 'rejected', 'done'));
