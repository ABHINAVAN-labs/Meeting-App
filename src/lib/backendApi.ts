"use client";

import { createClient } from "@/utils/supabase/client";
import { safeGetClientSession } from "@/lib/supabaseClientAuth";

type BrowserSession = {
  access_token: string;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

const getBackendBaseUrl = () => {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_BACKEND_URL");
  }

  return backendUrl.replace(/\/$/, "");
};

export async function backendRequest<TResponse>(
  path: string,
  options: RequestOptions = {}
) {
  const supabase = createClient();
  const {
    data: { session },
  } = await safeGetClientSession<BrowserSession>(supabase);

  if (!session?.access_token) {
    throw new Error("You must be signed in to use student analytics.");
  }

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | TResponse
    | { error?: string; details?: unknown }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : `Backend request failed with status ${response.status}`;

    throw new Error(message || "Backend request failed");
  }

  return payload as TResponse;
}
