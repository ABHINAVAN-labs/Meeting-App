import { cookies } from "next/headers";

const SUPABASE_AUTH_COOKIE_FRAGMENT = "-auth-token";

export const isInvalidRefreshTokenError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Invalid Refresh Token") ||
    error.message.includes("Refresh Token Not Found")
  );
};

export async function clearServerSupabaseAuthCookies() {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.includes(SUPABASE_AUTH_COOKIE_FRAGMENT)) {
      continue;
    }

    cookieStore.set(cookie.name, "", {
      path: "/",
      maxAge: 0,
    });
  }
}
