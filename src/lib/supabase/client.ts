import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
  );
}
