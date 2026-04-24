const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
};

export const getAuthCallbackUrl = (nextPath?: string) => {
  const callbackUrl = new URL("/auth/callback", getBaseUrl());

  if (nextPath) {
    callbackUrl.searchParams.set("next", nextPath);
  }

  return callbackUrl.toString();
};
