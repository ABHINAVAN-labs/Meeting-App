import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import {
  clearServerSupabaseAuthCookies,
  isInvalidRefreshTokenError,
} from "@/lib/supabaseAuth";

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      user.id
    );

    if (deleteError) {
      console.error("Delete account error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete account" },
        { status: 500 }
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearServerSupabaseAuthCookies();
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Account delete route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
