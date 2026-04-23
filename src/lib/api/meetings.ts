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

export async function createMeeting(data: {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  participants: string[];
  videoUrl?: string;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/meetings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getMeetings(userId?: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  
  const res = await fetch(`${process.env.BACKEND_API_URL}/meetings?${params}`, {
    method: 'GET',
    headers,
  });
  return res.json();
}

export async function getMeeting(id: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/meetings/${id}`, {
    method: 'GET',
    headers,
  });
  return res.json();
}

export async function updateMeeting(id: string, data: Partial<{
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  participants: string[];
  videoUrl: string;
}>) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/meetings/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMeeting(id: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${process.env.BACKEND_API_URL}/meetings/${id}`, {
    method: 'DELETE',
    headers,
  });
  return res.json();
}
