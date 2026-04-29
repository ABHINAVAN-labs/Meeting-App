import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

async function handleSignOut() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000";

  return NextResponse.redirect(new URL("/sign-in", appUrl), 303);
}

export async function POST() {
  return handleSignOut();
}

export async function GET() {
  return handleSignOut();
}
