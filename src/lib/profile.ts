import type { User } from "@supabase/supabase-js";

export type UserProfileRecord = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "student" | "teacher" | "admin" | null;
  grade: string | null;
  section: string | null;
  academic_focus: string | null;
  institution_name: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export const getUserDisplayName = (user: User | null | undefined) => {
  const displayName = user?.user_metadata?.display_name;

  if (typeof displayName !== "string") {
    return null;
  }

  const trimmedName = displayName.trim();

  return trimmedName.length > 0 ? trimmedName : null;
};

const APP_AVATAR_PATH_FRAGMENT = "/storage/v1/object/public/avatars/";

export const isManagedAvatarUrl = (avatarUrl: string | null | undefined) =>
  typeof avatarUrl === "string" &&
  avatarUrl.trim().length > 0 &&
  avatarUrl.includes(APP_AVATAR_PATH_FRAGMENT);

export const getManagedAvatarUrl = (
  avatarUrl: string | null | undefined
): string | null =>
  isManagedAvatarUrl(avatarUrl) ? avatarUrl ?? null : null;

export const getProfileDisplayName = (
  profile: Pick<UserProfileRecord, "display_name" | "email"> | null | undefined
) => profile?.display_name ?? profile?.email ?? "User";

export const getProfileSubtitle = (
  profile:
    | Pick<UserProfileRecord, "grade" | "section" | "academic_focus" | "role">
    | null
    | undefined
) => {
  if (!profile) {
    return null;
  }

  if (profile.role === "student") {
    const parts = [profile.grade, profile.section, profile.academic_focus].filter(
      Boolean
    );

    return parts.length > 0 ? parts.join(" · ") : null;
  }

  return profile.academic_focus ?? null;
};

export const getProfileInitial = (name: string | null | undefined) =>
  (name?.trim().charAt(0) || "U").toUpperCase();

export const getProfileAvatarColor = (seed: string | null | undefined) => {
  const palette = [
    "#2563eb",
    "#059669",
    "#dc2626",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#be123c",
    "#4f46e5",
  ];

  const source = seed?.trim() || "user";
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return palette[hash % palette.length];
};
