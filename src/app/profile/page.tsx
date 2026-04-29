import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import DeleteAccountButton from "@/app/profile/DeleteAccountButton";
import ProfileAvatarEditor from "@/app/profile/ProfileAvatarEditor";
import ProfileDetailsEditor from "@/app/profile/ProfileDetailsEditor";
import { getOrCreateCurrentProfile } from "@/lib/profileStore";
import {
  getProfileDisplayName,
  getProfileInitial,
  getProfileSubtitle,
} from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, profile } = await getOrCreateCurrentProfile();

  if (!user || !profile) {
    redirect("/sign-in");
  }

  const displayName = getProfileDisplayName(profile);
  const initial = getProfileInitial(displayName);
  const subtitle = getProfileSubtitle(profile);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex justify-start">
          <Link
            href="/dashboard"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
            aria-label="Go back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              User Profile
            </p>
            <h1 className="mt-2 text-4xl font-bold">{displayName}</h1>
            {subtitle ? <p className="mt-2 text-zinc-400">{subtitle}</p> : null}
          </div>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <ProfileAvatarEditor
            userId={profile.id}
            displayName={displayName}
            initial={initial}
            avatarUrl={profile.avatar_url}
          />
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Account details</h2>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            <ProfileDetailsEditor
              userId={profile.id}
              initialDisplayName={profile.display_name}
              initialBio={profile.bio}
            />
            <div className="rounded-xl bg-zinc-950 p-4">
              <dt className="text-sm text-zinc-400">Email</dt>
              <dd className="mt-1 text-lg">{profile.email}</dd>
            </div>
            <div className="rounded-xl bg-zinc-950 p-4">
              <dt className="text-sm text-zinc-400">User ID</dt>
              <dd className="mt-1 break-all text-sm text-zinc-300">{profile.id}</dd>
            </div>
            <div className="rounded-xl bg-zinc-950 p-4">
              <dt className="text-sm text-zinc-400">Joined</dt>
              <dd className="mt-1 text-lg">
                {new Date(profile.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-red-500/20 bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold text-red-300">Danger zone</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Deleting your account permanently removes your profile and deletes
              your Supabase auth user. This action cannot be undone.
            </p>
            <div className="mt-6">
              <DeleteAccountButton />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold">Session</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Sign out of your current account on this device.
            </p>
            <div className="mt-6">
              <form action="/sign-out" method="post">
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-800 px-4 py-2 transition-colors hover:bg-zinc-700"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

