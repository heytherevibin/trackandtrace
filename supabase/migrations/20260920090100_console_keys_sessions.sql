-- Security keys, the sessions they verify, and the single-use challenges both rely on.

create type console.key_type as enum ('passkey', 'security_key');
create type console.challenge_purpose as enum ('sign_in', 'add_key', 'action');

create table console.keys (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references console.members (user_id) on delete cascade,
  credential_id  bytea not null,
  public_key     bytea not null,
  counter        bigint not null default 0 check (counter >= 0),
  transports     text[] not null default '{}',
  name           text not null check (char_length(name) between 1 and 60),
  type           console.key_type not null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  constraint console_keys_credential_key unique (credential_id)
);

create index console_keys_member_idx on console.keys (member_id, created_at);

create table console.sessions (
  session_id       uuid primary key,
  member_id        uuid not null references console.members (user_id) on delete cascade,
  key_id           uuid references console.keys (id) on delete set null,
  key_verified_at  timestamptz,
  device_label     text not null check (char_length(device_label) between 1 and 120),
  address_hash     text not null check (char_length(address_hash) between 1 and 128),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index console_sessions_member_idx on console.sessions (member_id, created_at desc);
create index console_sessions_live_idx on console.sessions (expires_at) where revoked_at is null;

create table console.challenges (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references console.members (user_id) on delete cascade,
  session_id  uuid references console.sessions (session_id) on delete cascade,
  purpose     console.challenge_purpose not null,
  challenge   text not null check (char_length(challenge) between 16 and 512),
  digest      bytea,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  constraint console_challenges_challenge_key unique (challenge),
  -- An action tap is always bound to a digest of what it approves.
  constraint console_challenges_action_digest check (purpose <> 'action' or digest is not null),
  -- §D fixes every challenge's window at five minutes. console.sessions gets
  -- no equivalent CHECK: verify_session moves its expiry to now() + 7 days,
  -- which may exceed created_at + 7 days.
  constraint console_challenges_expiry_window
    check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);

create index console_challenges_open_idx
  on console.challenges (member_id, purpose, expires_at) where used_at is null;

revoke all on console.keys, console.sessions, console.challenges from anon, authenticated;
