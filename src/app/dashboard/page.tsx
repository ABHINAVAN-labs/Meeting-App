import Link from "next/link";
import { redirect } from "next/navigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import { getOrCreateCurrentProfile } from "@/lib/profileStore";
import { getProfileDisplayName, getProfileInitial } from "@/lib/profile";
import { hasUserChosenName } from "@/lib/userProfile";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { user, profile } = await getOrCreateCurrentProfile();

  if (!user || !profile) {
    redirect("/sign-in");
  }

  if (!hasUserChosenName(user)) {
    redirect("/onboarding");
  }

  const greetingName = getProfileDisplayName(profile);
  const profileInitial = getProfileInitial(greetingName);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <nav className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
          >
            <ProfileAvatar
              avatarUrl={profile.avatar_url}
              alt={`${greetingName} avatar`}
              fallback={profileInitial}
              seed={profile.id}
              sizeClassName="h-10 w-10"
              textClassName="text-sm font-semibold"
            />
            <span className="hidden pr-2 text-sm text-zinc-300 sm:block">
              Profile
            </span>
          </Link>

          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto">
        <div className="bg-zinc-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {greetingName}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-800 p-4 rounded">
              <h3 className="text-lg font-medium mb-2">Your Meetings</h3>
              <p className="text-3xl font-bold text-blue-400">0</p>
              <p className="text-sm text-zinc-400">Upcoming meetings</p>
            </div>
            <div className="bg-zinc-800 p-4 rounded">
              <h3 className="text-lg font-medium mb-2">Insights</h3>
              <p className="text-3xl font-bold text-emerald-400">0</p>
              <p className="text-sm text-zinc-400">Generated insights</p>
            </div>
            <div className="bg-zinc-800 p-4 rounded">
              <h3 className="text-lg font-medium mb-2">Analyses</h3>
              <p className="text-3xl font-bold text-purple-400">0</p>
              <p className="text-sm text-zinc-400">Video analyses</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/meetings/new"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Schedule Meeting
            </Link>
            <Link
              href="/meetings"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            >
              View Meetings
            </Link>
            <Link
              href="/insights"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
            >
              View Insights
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
