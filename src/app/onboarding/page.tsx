"use client";

import { createClient } from "@/utils/supabase/client";
import { hasUserChosenName } from "@/lib/userProfile";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/sign-in");
        return;
      }

      if (hasUserChosenName(user)) {
        router.replace("/dashboard");
        return;
      }

      setLoading(false);
    };

    loadUser();
  }, [router, supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedNickname = nickname.trim();

    if (!trimmedNickname) {
      setError("Please enter the name you'd like us to use.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        display_name: trimmedNickname,
      },
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-white shadow-2xl shadow-black/30">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
          One quick step
        </p>
        <h1 className="mb-3 text-3xl font-bold">What should we call you?</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Choose the name or nickname you want to see inside your dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="nickname" className="mb-2 block text-sm text-zinc-400">
              Name or nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Alex"
              maxLength={40}
              autoFocus
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800"
          >
            {saving ? "Saving..." : "Continue to dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
