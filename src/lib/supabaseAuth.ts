import { cookies } from "next/headers";

const SUPABASE_AUTH_COOKIE_FRAGMENT = "-auth-token";

const getErrorMessage = (error: unknown): string | null => {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return null;
};

export const isInvalidRefreshTokenError = (error: unknown) => {
  const message = getErrorMessage(error);

  if (!message) {
    return false;
  }

  return (
    message.includes("Invalid Refresh Token") ||
    message.includes("Refresh Token Not Found")
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
