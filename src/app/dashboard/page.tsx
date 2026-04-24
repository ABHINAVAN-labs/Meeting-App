"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/sign-in');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <nav className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          Sign Out
        </button>
      </nav>

      <div className="max-w-4xl mx-auto">
        <div className="bg-zinc-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {user.email}</h2>
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
