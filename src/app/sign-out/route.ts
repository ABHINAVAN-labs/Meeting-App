import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  
  await supabase.auth.signOut();
  
  return NextResponse.redirect(new URL('/sign-in', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
}
