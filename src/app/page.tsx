import { createClient } from "@/utils/supabase/server";
import { hasUserChosenName } from "@/lib/userProfile";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(hasUserChosenName(user) ? "/dashboard" : "/onboarding");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-zinc-950 text-white">
      <h1 className="text-6xl font-bold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
        Meeting App
      </h1>
      <p className="text-xl text-zinc-400 mb-8">
        AI-powered meeting insights powered by LLMs and Computer Vision
      </p>
      <div className="flex gap-4">
        <Link
          href="/sign-in"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors"
        >
          Sign Up
        </Link>
      </div>
    </main>
  );
}
