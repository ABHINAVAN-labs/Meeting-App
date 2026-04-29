"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

const PASSWORD_MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createClient());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setMessage("Password updated successfully. You can now sign in.");
      setPassword("");
      setConfirmPassword("");
    } catch (unknownError) {
      const fallbackMessage =
        unknownError instanceof Error
          ? unknownError.message
          : "Unable to update password right now.";
      setError(fallbackMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070f] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-6 text-white shadow-xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter your new password to finish resetting your account.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-slate-100 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-cyan-400/80 focus:bg-white/15 focus:ring-4 focus:ring-cyan-400/20"
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-200" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-slate-100 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-cyan-400/80 focus:bg-white/15 focus:ring-4 focus:ring-cyan-400/20"
              autoComplete="new-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-400/15 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-3 py-2 text-sm text-emerald-100">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-cyan-300/30 bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-300">
          <Link className="font-semibold text-cyan-300 hover:text-cyan-200" href="/sign-in">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
