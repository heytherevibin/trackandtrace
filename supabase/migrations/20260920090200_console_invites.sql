-- Invites for new members, and the one-time link that makes the first Owner.
-- The spec fixes the window at 7 days for invites; the creating function still supplies expires_at,
-- but the database enforces it stays within bounds.

create table console.invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role         console.member_role not null,
  invited_by   uuid not null references console.members (user_id) on delete cascade,
  token_hash   bytea not null,
  sent_at      timestamptz,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint console_invites_token_key unique (token_hash),
  constraint console_invites_expiry_window check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

-- One live invite per address. Accepted and revoked ones fall out of the index.
create unique index console_invites_live_email_idx
  on console.invites (email) where accepted_at is null and revoked_at is null;

create table console.setup_links (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and char_length(email) between 3 and 254),
  token_hash  bytea not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint console_setup_links_token_key unique (token_hash),
  constraint console_setup_links_expiry_window check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);

revoke all on console.invites, console.setup_links from anon, authenticated;
