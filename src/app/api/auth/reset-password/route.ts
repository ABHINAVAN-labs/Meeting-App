import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type ResetPasswordPayload = {
  email?: string;
};

export async function POST(request: Request) {
  let payload: ResetPasswordPayload;

  try {
    payload = (await request.json()) as ResetPasswordPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = payload.email?.trim();

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    message: "If that email exists, a password reset link has been sent.",
  });
}
