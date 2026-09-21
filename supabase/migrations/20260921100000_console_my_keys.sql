-- What a member may do to their own keys and sessions. Every one of these
-- checks the caller itself through console.current_member() (spec §E), so
-- none of them takes a member id: the only account any of them can touch is
-- the caller's own.

create or replace function public.console_my_keys()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
begin
  return jsonb_build_object(
    -- The credential id and public key are deliberately absent: the screen
    -- shows a name, a type and two dates, and a credential is not ours to
    -- hand back to a browser that did not just produce it.
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'name', k.name,
        'type', k.type,
        'created_at', k.created_at,
        'last_used_at', k.last_used_at
      -- `k.id` breaks the tie. created_at defaults to now(), which is transaction time, so keys
      -- written in one transaction share a timestamp exactly -- and without a tiebreaker the order
      -- is whatever the plan happens to produce, so the table could reorder itself between two
      -- refreshes. It surfaced as a pgTAP test that failed about one run in six.
      ) order by k.created_at, k.id)
      from console.keys k where k.member_id = v_member.user_id
    ), '[]'::jsonb),
    'member', jsonb_build_object(
      'name', v_member.name,
      'email', v_member.email,
      'role', v_member.role,
      'created_at', v_member.created_at
    )
  );
end;
$$;

-- A name is a label, not a security boundary, so this takes no tap -- but it
-- still only ever reaches a key the caller owns, and it is still logged.
create or replace function public.console_rename_key(p_key uuid, p_name text, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
  v_old    text;
begin
  select k.name into v_old
    from console.keys k
   where k.id = p_key and k.member_id = v_member.user_id;

  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  update console.keys set name = p_name where id = p_key and member_id = v_member.user_id;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'session', 'Renamed a key', p_name, null, 'done', null,
    jsonb_build_object('name', v_old), jsonb_build_object('name', p_name)
  );
end;
$$;

-- Spec §D: "A key can't be removed if that would leave fewer than two." The
-- count is read here rather than trusted from the caller, and the tap is spent
-- in the same transaction as the delete and its audit row -- so a refused
-- removal leaves the tap unspent and the key in place.
create or replace function public.console_remove_key(p_key uuid, p_reason text, p_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member    console.members := console.current_member();
  v_name      text;
  v_remaining integer;
begin
  select k.name into v_name
    from console.keys k
   where k.id = p_key and k.member_id = v_member.user_id;

  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  -- Nothing but this check holds the floor up, and a bare read of the count
  -- does not hold it against a second caller: two removals of two different
  -- keys would each read the same pre-delete count, each pass, and together
  -- leave the member below two keys and locked out of a console whose only
  -- second factor is a key. Locking the member's key rows makes the second
  -- caller wait for the first to commit or roll back, and the count below --
  -- a new statement, so a new snapshot -- then reads the settled number.
  -- `order by k.id` has both callers take the locks in the same order, so
  -- they queue instead of deadlocking.
  perform 1 from console.keys k
   where k.member_id = v_member.user_id
   order by k.id
     for update;

  select count(*) - 1 into v_remaining
    from console.keys k where k.member_id = v_member.user_id;

  if v_remaining < 2 then
    raise exception 'a member must keep at least two keys' using errcode = '42501';
  end if;

  -- The digest binds the tap to this key, this remaining count and this
  -- reason. A tap taken for a different key, or before the count changed,
  -- recomputes to a different digest and is not found.
  perform console.use_tap('Removed a key', v_name, v_remaining::text, p_reason);

  delete from console.keys where id = p_key and member_id = v_member.user_id;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'session', 'Removed a key', v_name, p_reason, 'done', null,
    jsonb_build_object('keys', v_remaining + 1), jsonb_build_object('keys', v_remaining)
  );

  return v_remaining;
end;
$$;

create or replace function public.console_my_sessions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.current_member();
  v_current uuid := console.claim_uuid('session_id');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'session_id', s.session_id,
      'device_label', s.device_label,
      'last_seen_at', s.last_seen_at,
      'created_at', s.created_at,
      'is_current', s.session_id = v_current
    -- Same tiebreaker as console_my_keys, for the same reason: two sessions can share a
    -- created_at, and a list that reorders itself between refreshes is its own small bug.
    ) order by s.created_at desc, s.session_id)
    from console.sessions s
    where s.member_id = v_member.user_id
      and s.revoked_at is null
      and s.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

-- No tap: this only ever reduces the caller's own access, and the drawn
-- screen confirms it with a dialog rather than a key.
create or replace function public.console_sign_out_others(p_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.current_member();
  v_current uuid := console.claim_uuid('session_id');
  v_count   integer;
begin
  update console.sessions
     set revoked_at = now()
   where member_id = v_member.user_id
     and session_id <> v_current
     and revoked_at is null;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform console.write_audit(
      p_environment, v_member.user_id, v_member.name, v_member.role,
      null, null, 'session', 'Signed out other sessions', 'Console', null, 'done', null,
      null, jsonb_build_object('sessions', v_count)
    );
  end if;

  return v_count;
end;
$$;

revoke all on function
  public.console_my_keys(),
  public.console_rename_key(uuid, text, text),
  public.console_remove_key(uuid, text, text),
  public.console_my_sessions(),
  public.console_sign_out_others(text)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_my_keys(),
  public.console_rename_key(uuid, text, text),
  public.console_remove_key(uuid, text, text),
  public.console_my_sessions(),
  public.console_sign_out_others(text)
to authenticated;
