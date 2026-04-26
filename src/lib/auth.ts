import { createClient } from "@/utils/supabase/server";
import {
  clearServerSupabaseAuthCookies,
  isInvalidRefreshTokenError,
} from "@/lib/supabaseAuth";

export async function getCurrentUser() {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user;
  } catch (error) {
    if (!isInvalidRefreshTokenError(error)) {
      throw error;
    }

    await clearServerSupabaseAuthCookies();
    return null;
  }
}

export async function getSession() {
  const supabase = await createClient();

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session;
  } catch (error) {
    if (!isInvalidRefreshTokenError(error)) {
      throw error;
    }

    await clearServerSupabaseAuthCookies();
    return null;
  }
}
