import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function hasSupabaseServiceClientConfig(): boolean {
  const url = (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() as string;
  return Boolean(url && serviceRoleKey);
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  if (!hasSupabaseServiceClientConfig()) {
    return null;
  }
  const url = (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() as string;

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return cachedClient;
}
