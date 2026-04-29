export type ProfileRole = 'student' | 'teacher' | 'admin';

export type StudentAnalyticsProfile = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ProfileRole | null;
  grade: string | null;
  section: string | null;
  academicFocus: string | null;
  institutionName: string | null;
  headline: string | null;
};

export type StudentCardResponse = {
  profile: StudentAnalyticsProfile;
  snapshot: Record<string, unknown> | null;
  recentActivityBadges: string[];
};
