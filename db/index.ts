import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | undefined;

function isPublishableKey(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
  } catch {
    return false;
  }
}

/** Creates a server-only client. Keep SUPABASE_SECRET_KEY out of browser code. */
export function getDb() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before starting Task Operations Portal.");
  if (isPublishableKey(key))
    throw new Error("SUPABASE_SECRET_KEY is using a publishable/anon key. Set it to Supabase's server Secret key (sb_secret_...) or legacy service_role key so server-side requests can pass RLS.");
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return client;
}

export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export function camelize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(camelize) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()), camelize(item)])) as T;
}
