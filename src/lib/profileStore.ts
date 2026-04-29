import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import {
  getManagedAvatarUrl,
  getUserDisplayName,
  type UserProfileRecord,
} from "@/lib/profile";
import {
  clearServerSupabaseAuthCookies,
  isInvalidRefreshTokenError,
} from "@/lib/supabaseAuth";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const buildProfilePayload = (
  user: User,
  existingProfile?: Partial<UserProfileRecord> | null
) => ({
  id: user.id,
  email: user.email ?? existingProfile?.email ?? "",
  display_name: getUserDisplayName(user) ?? existingProfile?.display_name ?? null,
  avatar_url: getManagedAvatarUrl(existingProfile?.avatar_url),
  role: existingProfile?.role ?? null,
  grade: existingProfile?.grade ?? null,
  section: existingProfile?.section ?? null,
  academic_focus: existingProfile?.academic_focus ?? null,
  institution_name: existingProfile?.institution_name ?? null,
  bio: existingProfile?.bio ?? null,
});

export async function syncProfileFromAuthUser(
  user: User,
  supabase?: SupabaseServerClient
) {
  const client = supabase ?? (await createClient());

  const { data: existingProfile, error: existingProfileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<UserProfileRecord>();

  if (existingProfileError) {
    console.error("Profile lookup failed", {
      userId: user.id,
      code: existingProfileError.code,
      message: existingProfileError.message,
      details: existingProfileError.details,
      hint: existingProfileError.hint,
    });
    throw new Error(
      `Failed to load profile: ${existingProfileError.message}${
        existingProfileError.code ? ` (code ${existingProfileError.code})` : ""
      }`
    );
  }

  const payload = buildProfilePayload(user, existingProfile);

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
  let user: User | null = null;

  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    user = currentUser;
  } catch (error) {
    if (!isInvalidRefreshTokenError(error)) {
      throw error;
    }

    await clearServerSupabaseAuthCookies();
  }

  if (!user) {
    return { user: null, profile: null };
  }

  const profile = await syncProfileFromAuthUser(user, supabase);

  return { user, profile };
}
