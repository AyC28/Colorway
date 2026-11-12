/** The one Supabase client (browser). Null when the project keys are not configured. */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !key || typeof window === "undefined") return null;
  return (client ??= createBrowserClient(url, key));
}
