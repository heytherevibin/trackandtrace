-- The guard every member function runs first, and the tap check every risky
-- action runs before it changes anything.

-- Every claim read goes through here, so a claims value that is neither
-- missing nor a valid uuid (an empty string, a malformed subject) fails
-- closed with the same 'session ended' this guard promises everywhere else,
-- instead of leaking whatever raw cast error Postgres happens to raise.
-- The risky expression lives in the BEGIN section, not a DECLARE initializer:
-- a block's own EXCEPTION clause never catches an error raised while that
-- same block's declarations are being evaluated, only errors raised once its
-- BEGIN section is running.
create or replace function console.claim_uuid(p_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text;
begin
  v_text := nullif(current_setting('request.jwt.claims', true)::jsonb ->> p_key, '');
  return v_text::uuid;
exception when invalid_text_representation then
  raise exception 'session ended' using errcode = '28000';
end;
$$;

revoke all on function console.claim_uuid(text) from public, anon, authenticated;

create or replace function console.current_member()
returns console.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := console.claim_uuid('sub');
  v_session uuid := console.claim_uuid('session_id');
  v_member  console.members;
begin
  if v_user is null or v_session is null then
    raise exception 'session ended' using errcode = '28000';
  end if;

  -- A session ends after 24 hours unused, or 7 days after its key tap. Both are
  -- checked here, because last_seen_at only moves when the member is working.
  update console.sessions
     set last_seen_at = now()
   where session_id = v_session
     and member_id = v_user
     and key_verified_at is not null
     and revoked_at is null
     and expires_at > now()
     and last_seen_at > now() - interval '24 hours';

  if not found then
    raise exception 'session ended' using errcode = '28000';
  end if;

  select * into v_member
    from console.members
   where user_id = v_user and status = 'active';

  if not found then
    raise exception 'session ended' using errcode = '28000';
  end if;

  return v_member;
end;
$$;

revoke all on function console.current_member() from public, anon, authenticated;

create or replace function console.require_role(p_least console.member_role)
returns console.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member      console.members := console.current_member();
  v_member_rank int;
  v_least_rank  int;
begin
  if p_least is null then
    raise exception 'no access' using errcode = '42501';
  end if;

  v_member_rank := console.role_rank(v_member.role);
  v_least_rank  := console.role_rank(p_least);

  -- role_rank has no ELSE, so an unrecognised role ranks null; null < null is
  -- null, which plpgsql's IF treats as false, so this must be checked
  -- explicitly rather than trusted to the comparison alone.
  if v_member_rank is null or v_least_rank is null or v_member_rank < v_least_rank then
    raise exception 'no access' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

revoke all on function console.require_role(console.member_role) from public, anon, authenticated;

-- The four things a tap approves. Each field is hashed on its own, because a
-- separator can appear inside a field and would otherwise let one field's
-- text be read as another's -- joining with a separator byte is not
-- injective: a byte-31 inside target and the same byte inside value can
-- shift where one field ends and the next begins, and concat_ws silently
-- drops a null argument, shifting every boundary after it. Fixed-length
-- (32-byte) sub-hashes make the boundaries unambiguous regardless of what a
-- field contains. The server stores the final digest with the challenge; the
-- database recomputes it from its own arguments.
create or replace function console.action_digest(p_action text, p_target text, p_value text, p_reason text)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select extensions.digest(
    extensions.digest(coalesce(p_action, ''), 'sha256') ||
    extensions.digest(coalesce(p_target, ''), 'sha256') ||
    extensions.digest(coalesce(p_value,  ''), 'sha256') ||
    extensions.digest(coalesce(p_reason, ''), 'sha256'),
    'sha256'
  );
$$;

revoke all on function console.action_digest(text, text, text, text) from public, anon, authenticated;

create or replace function console.use_tap(p_action text, p_target text, p_value text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := console.claim_uuid('session_id');
  v_member  console.members := console.current_member();
  v_id      uuid;
begin
  update console.challenges
     set used_at = now()
   where id = (
     select id from console.challenges
      where member_id = v_member.user_id
        and session_id = v_session
        and purpose = 'action'
        and used_at is null
        and expires_at > now()
        and digest = console.action_digest(p_action, p_target, p_value, p_reason)
      order by created_at
      limit 1
      for update skip locked
   )
   returning id into v_id;

  if v_id is null then
    raise exception 'no tap for this action' using errcode = '42501';
  end if;

  return v_id;
end;
$$;

revoke all on function console.use_tap(text, text, text, text) from public, anon, authenticated;
