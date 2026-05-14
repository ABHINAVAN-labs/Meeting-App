alter table public.participants
  add column if not exists join_identity_type text check (join_identity_type in ('email', 'phone')),
  add column if not exists join_identity_hash text;

create table if not exists public.meeting_bans (
  meeting_code text not null references public.meetings(meeting_code) on delete cascade,
  identity_type text not null check (identity_type in ('email', 'phone')),
  identity_hash text not null,
  banned_by_participant_id text not null,
  banned_at timestamptz not null default now(),
  primary key (meeting_code, identity_hash)
);

create index if not exists idx_participants_meeting_identity_hash on public.participants(meeting_code, join_identity_hash);
create index if not exists idx_meeting_bans_meeting_identity_hash on public.meeting_bans(meeting_code, identity_hash);
