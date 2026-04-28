"use client";

export type AuthMode = "login" | "signup";

export type AuthPayload = {
  email: string;
  password: string;
  name?: string;
};

type AuthSuccess = {
  token?: string;
  session?: string;
  accessToken?: string;
  [key: string]: unknown;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";

const getEndpoint = (mode: AuthMode) => {
  const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
  return `${API_BASE_URL}${path}`;
};

const getErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data?.message || data?.error || "Authentication failed.";
  } catch {
    return "Authentication failed.";
  }
};

export async function authRequest(mode: AuthMode, payload: AuthPayload) {
  const response = await fetch(getEndpoint(mode), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  const data = (await response.json()) as AuthSuccess;
  const token =
    typeof data.token === "string"
      ? data.token
      : typeof data.accessToken === "string"
      ? data.accessToken
      : typeof data.session === "string"
      ? data.session
      : null;

  if (token) {
    localStorage.setItem("lumina_auth_token", token);
  }

  localStorage.setItem("lumina_auth_session", JSON.stringify(data));
  return data;
}

