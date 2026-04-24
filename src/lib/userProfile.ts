import type { User } from "@supabase/supabase-js";

export const getUserChosenName = (user: User | null | undefined) => {
  const chosenName = user?.user_metadata?.display_name;

  if (typeof chosenName !== "string") {
    return null;
  }

  const trimmedName = chosenName.trim();

  return trimmedName.length > 0 ? trimmedName : null;
};

export const hasUserChosenName = (user: User | null | undefined) =>
  getUserChosenName(user) !== null;
