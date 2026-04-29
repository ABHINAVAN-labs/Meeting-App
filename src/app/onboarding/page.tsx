"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { safeGetClientUser } from "@/lib/supabaseClientAuth";
import { hasUserChosenName } from "@/lib/userProfile";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await safeGetClientUser<User>(supabase);

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
    const trimmedGrade = grade.trim();
    const trimmedSection = section.trim();
    const trimmedInstitutionName = institutionName.trim();

    if (!trimmedNickname) {
      setError("Please enter the name you'd like us to use.");
      return;
    }

    if (!trimmedInstitutionName) {
      setError("Please enter your school or institution name.");
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

    const {
      data: { user },
    } = await safeGetClientUser<User>(supabase);

    if (user) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          display_name: trimmedNickname,
          avatar_url: null,
          role,
          grade: role === "student" ? trimmedGrade || null : null,
          section: role === "student" ? trimmedSection || null : null,
          institution_name: trimmedInstitutionName,
        },
        { onConflict: "id" }
      );

      if (profileError) {
        setError(profileError.message);
        setSaving(false);
        return;
      }
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
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-white shadow-2xl shadow-black/30">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
          One quick step
        </p>
        <h1 className="mb-3 text-3xl font-bold">Set up your profile</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Add the details we need to personalize your dashboard and student card.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="nickname" className="mb-2 block text-sm text-zinc-400">
                Name or nickname
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Arjun Mehta"
                maxLength={40}
                autoFocus
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="role" className="mb-2 block text-sm text-zinc-400">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(event) => setRole(event.target.value as "student" | "teacher")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>

            <div>
              <label htmlFor="institution" className="mb-2 block text-sm text-zinc-400">
                School or institution
              </label>
              <input
                id="institution"
                type="text"
                value={institutionName}
                onChange={(event) => setInstitutionName(event.target.value)}
                placeholder="Learnos Academy"
                maxLength={255}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {role === "student" ? (
              <>
                <div>
                  <label htmlFor="grade" className="mb-2 block text-sm text-zinc-400">
                    Grade
                  </label>
                  <input
                    id="grade"
                    type="text"
                    value={grade}
                    onChange={(event) => setGrade(event.target.value)}
                    placeholder="Grade 11"
                    maxLength={20}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="section" className="mb-2 block text-sm text-zinc-400">
                    Section
                  </label>
                  <input
                    id="section"
                    type="text"
                    value={section}
                    onChange={(event) => setSection(event.target.value)}
                    placeholder="Section B"
                    maxLength={50}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            ) : null}

          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800"
          >
            {saving ? "Saving..." : "Save profile and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
