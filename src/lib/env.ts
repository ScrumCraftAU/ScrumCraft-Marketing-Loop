import "server-only";

export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  loopModel: process.env.LOOP_MODEL || "claude-opus-5",
  ingestSecret: process.env.INGEST_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL || "https://scrumcraft.atlassian.net",
  confluenceEmail: process.env.CONFLUENCE_EMAIL ?? "",
  confluenceApiToken: process.env.CONFLUENCE_API_TOKEN ?? "",
  // Same Atlassian site and account as Confluence unless set separately.
  jiraBaseUrl: process.env.JIRA_BASE_URL || process.env.CONFLUENCE_BASE_URL || "https://scrumcraft.atlassian.net",
  jiraEmail: process.env.JIRA_EMAIL || process.env.CONFLUENCE_EMAIL || "",
  jiraApiToken: process.env.JIRA_API_TOKEN || process.env.CONFLUENCE_API_TOKEN || "",
};

export const isConfluenceConfigured = () => Boolean(env.confluenceEmail && env.confluenceApiToken);
export const isJiraConfigured = () => Boolean(env.jiraEmail && env.jiraApiToken);

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseSecretKey);
export const isAnthropicConfigured = () => Boolean(env.anthropicApiKey);
