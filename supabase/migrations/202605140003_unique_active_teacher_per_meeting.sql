create unique index if not exists uniq_active_teacher_per_meeting
  on public.participants(meeting_code)
  where role = 'teacher' and status = 'active';
