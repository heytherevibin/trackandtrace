-- What the Next.js server calls with the service role while a member signs in.
-- None of these decide anything a member's own session could: they are the
-- steps that happen before a key-verified session exists.

create or replace function public.console_auth_member_by_email(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', m.user_id,
    'email', m.email,
    'name', m.name,
    'role', m.role,
    'status', m.status,
    'key_count', (select count(*) from console.keys k where k.member_id = m.user_id)
  )
  from console.members m
  where m.email = lower(p_email) and m.status <> 'removed';
$$;

create or replace function public.console_auth_start_session(
  p_session_id   uuid,
  p_member       uuid,
  p_device_label text,
  p_address_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into console.sessions (session_id, member_id, device_label, address_hash, expires_at)
  values (p_session_id, p_member, p_device_label, p_address_hash, now() + interval '24 hours')
  on conflict (session_id) do nothing;
$$;

create or replace function public.console_auth_verify_session(p_session_id uuid, p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update console.sessions
     set key_verified_at = now(),
         key_id = p_key_id,
         expires_at = now() + interval '7 days',
         last_seen_at = now()
   where session_id = p_session_id and revoked_at is null;

  if not found then
    raise exception 'session ended' using errcode = '28000';
  end if;

  update console.keys set last_used_at = now() where id = p_key_id;
end;
$$;

create or replace function public.console_auth_revoke_session(p_session_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update console.sessions set revoked_at = now()
   where session_id = p_session_id and revoked_at is null;
$$;

create or replace function public.console_auth_revoke_member_sessions(p_member uuid, p_except uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update console.sessions set revoked_at = now()
   where member_id = p_member
     and revoked_at is null
     and (p_except is null or session_id <> p_except);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.console_auth_new_challenge(
  p_member    uuid,
  p_session   uuid,
  p_purpose   console.challenge_purpose,
  p_challenge text,
  p_digest    bytea
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
  values (p_member, p_session, p_purpose, p_challenge, p_digest, now() + interval '5 minutes')
  returning id;
$$;

create or replace function public.console_auth_take_challenge(
  p_challenge text,
  p_member    uuid,
  p_purpose   console.challenge_purpose
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with taken as (
    update console.challenges
       set used_at = now()
     where challenge = p_challenge
       and member_id = p_member
       and purpose = p_purpose
       and used_at is null
       and expires_at > now()
    returning *
  )
  select to_jsonb(t) from taken t;
$$;

-- Supabase's default privileges on the public schema auto-grant EXECUTE on a
-- new function to anon, authenticated and service_role alike, so service_role
-- must be named in the revoke here too, even though it is the very role about
-- to be granted back below -- naming only public and anon would leave that
-- default standing, and none of these may be reached except through the
-- service role while a member is signing in, before any session exists.
revoke all on function
  public.console_auth_member_by_email(text),
  public.console_auth_start_session(uuid, uuid, text, text),
  public.console_auth_verify_session(uuid, uuid),
  public.console_auth_revoke_session(uuid),
  public.console_auth_revoke_member_sessions(uuid, uuid),
  public.console_auth_new_challenge(uuid, uuid, console.challenge_purpose, text, bytea),
  public.console_auth_take_challenge(text, uuid, console.challenge_purpose)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_auth_member_by_email(text),
  public.console_auth_start_session(uuid, uuid, text, text),
  public.console_auth_verify_session(uuid, uuid),
  public.console_auth_revoke_session(uuid),
  public.console_auth_revoke_member_sessions(uuid, uuid),
  public.console_auth_new_challenge(uuid, uuid, console.challenge_purpose, text, bytea),
  public.console_auth_take_challenge(text, uuid, console.challenge_purpose)
to service_role;
