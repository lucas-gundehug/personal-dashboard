import { createClient } from "@supabase/supabase-js";

// Same optional-client pattern as redis.ts. SUPABASE_SERVICE_ROLE_KEY (never
// the anon/publishable key) is required because workout-store.ts talks to
// Postgres directly with no Supabase Auth session — RLS is enabled on both
// tables with no policies, so only the service role can read/write them.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false },
      })
    : null;
