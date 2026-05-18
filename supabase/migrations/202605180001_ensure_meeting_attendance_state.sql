create table if not exists public.meeting_attendance_state (
  meeting_code text primary key references public.meetings(meeting_code) on delete cascade,
  threshold_percent integer check (threshold_percent between 1 and 100),
  tracking_started_at_ms bigint,
  ended_at_ms bigint,
  summary jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_attendance_records (
  meeting_code text not null references public.meetings(meeting_code) on delete cascade,
  participant_id text not null,
  display_name text not null,
  role text not null check (role = 'student'),
  joined_at_ms bigint not null,
  active_from_ms bigint,
  attended_ms bigint not null default 0,
  banned boolean not null default false,
  last_seen_at_ms bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (meeting_code, participant_id)
);

create index if not exists idx_meeting_attendance_records_meeting
on public.meeting_attendance_records(meeting_code);

drop trigger if exists trg_meeting_attendance_records_touch_updated_at
on public.meeting_attendance_records;

create trigger trg_meeting_attendance_records_touch_updated_at
before update on public.meeting_attendance_records
for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
