import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  
  return headers;
}

export async function generateInsight(data: {
  meetingId: string;
  userId: string;
  factors?: {
    communicationStyle?: 'direct' | 'indirect' | 'collaborative' | 'analytical';
    goals?: string[];
    preferences?: Record<string, any>;
  };
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/insights/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getUserInsights(userId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/insights/user/${userId}`, {
    method: 'GET',
    headers,
  });
  return res.json();
}
