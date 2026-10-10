-- Each experiment can link to one primary Jira item. Jira and the Experiments board stay in
-- step both ways: moving the Jira item moves the experiment's column, and moving the
-- experiment transitions the Jira item. Approving an unlinked experiment creates a story.
alter table public.experiments
  add column jira_key text,
  add column jira_status text,
  add column jira_synced_at timestamptz;

create unique index experiments_jira_key_key on public.experiments (jira_key) where jira_key is not null;
