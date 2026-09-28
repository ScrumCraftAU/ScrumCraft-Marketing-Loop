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
};

export const isConfluenceConfigured = () => Boolean(env.confluenceEmail && env.confluenceApiToken);

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseSecretKey);
export const isAnthropicConfigured = () => Boolean(env.anthropicApiKey);
