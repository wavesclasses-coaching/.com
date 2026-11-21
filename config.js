/* Paste your Supabase project URL and anon/public key here.
   NEVER put a service_role/secret key in this file. */
window.APP_CONFIG = {
  SUPABASE_URL: "https://lilvcqhjimgcqbwammwb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_uYhHpJ69vz7IGF0-wAEdiQ_QmP1AvD4",
  COACHING_NAME: "waves classes"
};

// Keep the public browser configuration read-only after initialization.
// The anon/publishable key is intended for browser use; protect data with Supabase RLS.
// Never place a service_role key or other secret in this file.
if (window.APP_CONFIG) {
  window.APP_CONFIG.SUPABASE_URL =
    String(window.APP_CONFIG.SUPABASE_URL || "").trim().replace(/\/$/, "");
  window.APP_CONFIG.SUPABASE_ANON_KEY =
    String(window.APP_CONFIG.SUPABASE_ANON_KEY || "").trim();
  window.APP_CONFIG.COACHING_NAME =
    String(window.APP_CONFIG.COACHING_NAME || "WAVES CLASSES").trim();

  Object.freeze(window.APP_CONFIG);
}

