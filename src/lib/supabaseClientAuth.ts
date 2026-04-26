"use client";

type ClientSupabaseAuth = {
  getSession: () => Promise<{
    data: { session: unknown | null };
    error?: { message?: string } | null;
  }>;
  getUser: () => Promise<{
    data: { user: unknown | null };
    error?: { message?: string } | null;
  }>;
  signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<unknown>;
};

type ClientSupabaseLike = {
  auth: ClientSupabaseAuth;
};

const isRefreshTokenErrorMessage = (message: string | undefined) =>
  typeof message === "string" &&
  (message.includes("Invalid Refresh Token") ||
    message.includes("Refresh Token Not Found"));

async function clearBrokenClientSession(supabase: ClientSupabaseLike) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {}
}

export async function safeGetClientSession<TSession>(
  supabase: ClientSupabaseLike
) {
  const result = await supabase.auth.getSession();

  if (!isRefreshTokenErrorMessage(result.error?.message)) {
    return result as { data: { session: TSession | null } };
  }

  await clearBrokenClientSession(supabase);

  return {
    data: {
      session: null,
    },
  };
}

export async function safeGetClientUser<TUser>(supabase: ClientSupabaseLike) {
  const result = await supabase.auth.getUser();

  if (!isRefreshTokenErrorMessage(result.error?.message)) {
    return result as { data: { user: TUser | null } };
  }

  await clearBrokenClientSession(supabase);

  return {
    data: {
      user: null,
    },
  };
}
