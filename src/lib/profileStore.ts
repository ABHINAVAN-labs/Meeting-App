import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import {
  getUserAvatarUrl,
  getUserDisplayName,
  type UserProfileRecord,
} from "@/lib/profile";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const buildProfilePayload = (user: User) => ({
  id: user.id,
  email: user.email ?? "",
  display_name: getUserDisplayName(user),
  avatar_url: getUserAvatarUrl(user),
});

export async function syncProfileFromAuthUser(
  user: User,
  supabase?: SupabaseServerClient
) {
  const client = supabase ?? (await createClient());

  const payload = buildProfilePayload(user);

  const { data, error } = await client
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single<UserProfileRecord>();

  if (error) {
    console.error("Profile sync failed", {
      userId: user.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(
      `Failed to sync profile: ${error.message}${
        error.code ? ` (code ${error.code})` : ""
      }`
    );
  }

  return data;
}

export async function getOrCreateCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const profile = await syncProfileFromAuthUser(user, supabase);

  return { user, profile };
}
