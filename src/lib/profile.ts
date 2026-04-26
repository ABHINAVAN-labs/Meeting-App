import type { User } from "@supabase/supabase-js";

export type UserProfileRecord = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
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

export const getUserAvatarUrl = (user: User | null | undefined) => {
  const avatarUrl = user?.user_metadata?.avatar_url;

  return typeof avatarUrl === "string" && avatarUrl.trim().length > 0
    ? avatarUrl
    : null;
};

export const getProfileDisplayName = (
  profile: Pick<UserProfileRecord, "display_name" | "email"> | null | undefined
) => profile?.display_name ?? profile?.email ?? "User";

export const getProfileInitial = (name: string | null | undefined) =>
  (name?.trim().charAt(0) || "U").toUpperCase();
