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

export async function analyzeVideo(data: {
  meetingId: string;
  videoUrl: string;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/cv/analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getCVAnalysis(id: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/cv/${id}`, {
    method: 'GET',
    headers,
  });
  return res.json();
}
