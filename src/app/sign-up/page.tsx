"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SignUp() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/");
      }
    };
    checkSession();
  }, [supabase, router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      router.push("/sign-in");
    }

    setLoading(false);
  };

  const handleOAuthSignUp = async (provider: "google" | "github") => {
    setError(null);
    setOauthLoading(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      setError(error.message);
      setOauthLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-8">

        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Meeting App</h1>
          <p className="text-zinc-400">Create your account</p>
        </div>

        <div className="mt-8 space-y-4">
          <button
            onClick={() => handleOAuthSignUp("google")}
            disabled={oauthLoading !== null}
            className="w-full px-4 py-3 border border-zinc-800 rounded-lg text-white"
          >
            {oauthLoading === "google" ? "Redirecting..." : "Continue with Google"}
          </button>

          <button
            onClick={() => handleOAuthSignUp("github")}
            disabled={oauthLoading !== null}
            className="w-full px-4 py-3 border border-zinc-800 rounded-lg text-white"
          >
            {oauthLoading === "github" ? "Redirecting..." : "Continue with GitHub"}
          </button>
        </div>

        <form onSubmit={handleSignUp} className="mt-8 space-y-4">
          {error && <div className="text-red-400">{error}</div>}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-white"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

      </div>
    </div>
  );
}