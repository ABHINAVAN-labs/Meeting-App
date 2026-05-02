export type SessionCookie = {
  meetingCode: string;
  participantId: string;
};

export function parseSessionCookie(value: string | undefined): SessionCookie | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SessionCookie>;
    if (!parsed.meetingCode || !parsed.participantId) {
      return null;
    }

    return {
      meetingCode: parsed.meetingCode,
      participantId: parsed.participantId
    };
  } catch {
    return null;
  }
}
