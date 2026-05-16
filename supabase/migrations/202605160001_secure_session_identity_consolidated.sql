-- Consolidated migration for secure session-scoped participant identity.
-- Assumes earlier base migrations are present, and none of the removed
-- 20260516xxx split migrations were applied.

-- 1) Add secure participant/session columns.
alter table public.participants
  add column if not exists display_name_hash text,
  add column if not exists uuidv7_nonce text,
  add column if not exists active boolean not null default true,
  add column if not exists rejoin_nonce text,
  add column if not exists ip_prefix text,
  add column if not exists ua_hash text,
  add column if not exists expires_at timestamptz;

create index if not exists idx_participants_meeting_display_name_hash
  on public.participants(meeting_code, display_name_hash);
create index if not exists idx_participants_rejoin_nonce
  on public.participants(rejoin_nonce);

-- 2) Remove legacy email/phone identity fields.
alter table public.participants
  drop column if exists join_identity_type,
  drop column if exists join_identity_hash;

drop index if exists idx_participants_meeting_identity_hash;

-- 3) Enforce session-only ban identity type.
alter table public.meeting_bans
  drop constraint if exists meeting_bans_identity_type_check;

alter table public.meeting_bans
  add constraint meeting_bans_identity_type_check
  check (identity_type in ('participant_session'));
