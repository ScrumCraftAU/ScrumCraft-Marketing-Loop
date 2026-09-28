import "server-only";

export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  loopModel: process.env.LOOP_MODEL || "claude-opus-5",
  ingestSecret: process.env.INGEST_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
};

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseSecretKey);
export const isAnthropicConfigured = () => Boolean(env.anthropicApiKey);
