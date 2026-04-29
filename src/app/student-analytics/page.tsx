import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import StudentAnalyticsWorkspace from "@/components/student-analytics/StudentAnalyticsWorkspace";
import { getOrCreateCurrentProfile } from "@/lib/profileStore";

export const dynamic = "force-dynamic";

export default async function StudentAnalyticsPage() {
  const { user, profile } = await getOrCreateCurrentProfile();

  if (!user || !profile) {
    redirect("/sign-in");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
              aria-label="Go back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
                Student Analytics
              </p>
              <h1 className="mt-2 text-4xl font-bold">Feature workspace</h1>
              <p className="mt-2 text-sm text-zinc-400">
                Start sending live student events and activities into the new analytics pipeline.
              </p>
            </div>
          </div>
        </div>

        <StudentAnalyticsWorkspace profile={profile} />
      </div>
    </main>
  );
}
