import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  clearServerSupabaseAuthCookies,
  isInvalidRefreshTokenError,
} from "@/lib/supabaseAuth";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return NextResponse.json({ user });
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearServerSupabaseAuthCookies();
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error('Auth check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
