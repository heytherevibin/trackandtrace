-- The guard every member function runs first, and the tap check every risky
-- action runs before it changes anything.

create or replace function console.current_member()
returns console.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  v_session uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid;
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
  v_member console.members := console.current_member();
begin
  if console.role_rank(v_member.role) < console.role_rank(p_least) then
    raise exception 'no access' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

revoke all on function console.require_role(console.member_role) from public, anon, authenticated;

-- The four things a tap approves, joined by a unit separator so no field can
-- impersonate another, then hashed. The server stores this digest with the
-- challenge; the database recomputes it from its own arguments.
create or replace function console.action_digest(p_action text, p_target text, p_value text, p_reason text)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select extensions.digest(
    concat_ws(U&'\001F', p_action, coalesce(p_target, ''), coalesce(p_value, ''), coalesce(p_reason, '')),
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
  v_session uuid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid;
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
