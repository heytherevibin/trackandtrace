-- What an Owner may do to the team: list it, invite someone, change a role,
-- reset a member's keys, remove a member, and resend or revoke an invite.
-- Every parameter is text or uuid, never an enum: PostgREST casts an enum
-- argument in the CALLING role's context, before security definer applies,
-- and authenticated has no usage on schema console (console_schema.sql), so
-- the call would die with "permission denied for schema console" before the
-- function body ever ran. Each cast to console.member_role happens inside
-- the body instead, exactly as console_save_settings casts to 'admin' and
-- console_remove_key's siblings were rewritten in
-- 20260921000000_console_enum_args_as_text.sql.

-- Shared by console_change_role and console_remove_member: taking away the
-- console's last active Owner is refused. Same lock-then-count shape as
-- console_remove_key's two-key floor (20260921100000_console_my_keys.sql):
-- a bare read-then-act would let two concurrent demotions of the console's
-- last two Owners each read "two Owners", each pass, and together leave the
-- console with none. Locking every active-owner row first makes the second
-- caller wait for the first to commit, and its own count then reads the
-- settled number -- when the first caller's Owner has just lost the role,
-- the second caller's lock no longer matches that row at all, so it counts
-- only what is left. `order by user_id` gives every caller the same lock
-- order, so they queue instead of deadlocking.
--
-- This alone cannot produce a console with zero Owners through either
-- caller below, because both require console.require_role('owner') first --
-- the only person who could ever be the console's sole remaining Owner is
-- also the only person who could pass that gate, and console_change_role /
-- console_remove_member both separately refuse a member acting on
-- themselves. The guard still lives on its own, tested on its own: belt and
-- braces against a future change to either rule, the same reasoning
-- console.has_owner() was extracted for (20260920090800_console_first_owner.sql).
create or replace function console.require_another_active_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owners integer;
begin
  perform 1 from console.members
   where role = 'owner' and status = 'active'
   order by user_id
     for update;

  select count(*) into v_owners
    from console.members
   where role = 'owner' and status = 'active';

  if v_owners <= 1 then
    raise exception 'a console needs at least one owner' using errcode = '42501';
  end if;
end;
$$;

revoke all on function console.require_another_active_owner() from public, anon, authenticated;

-- The roster and the pending invites, in one call (spec §E). A removed
-- member falls out of the roster entirely -- the sheet draws only Active and
-- Setup incomplete, never a third row state for someone gone. key_count and
-- last_active_at are not columns: a member's own table carries neither, so
-- both are read from the tables that actually hold them.
create or replace function public.console_team()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
begin
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'email', m.email,
        'name', m.name,
        'role', m.role,
        'status', m.status,
        'key_count', (select count(*) from console.keys k where k.member_id = m.user_id),
        'last_active_at', (select max(s.last_seen_at) from console.sessions s where s.member_id = m.user_id)
      ) order by console.role_rank(m.role) desc, m.name, m.user_id)
      from console.members m
      where m.status <> 'removed'
    ), '[]'::jsonb),
    -- Never token_hash: a live invite (unaccepted, unrevoked) is what "pending"
    -- means here, matching the table's own console_invites_live_email_idx --
    -- an invite past its expires_at still shows, because nothing else prunes
    -- it and an Owner must be able to see it to revoke it or learn resending
    -- is refused.
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'email', i.email,
        'role', i.role,
        'sent_at', i.sent_at,
        'expires_at', i.expires_at
      ) order by i.created_at, i.id)
      from console.invites i
      where i.accepted_at is null and i.revoked_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- Inviting grants console access, so it takes a tap. The digest's four
-- fields (Task 4's own spec): action 'Invited a member', target the
-- address, value the role, reason. There is no row yet to bind a target id
-- to -- the address is the only thing both this call and the confirmation
-- dialog that requested the tap can already agree on.
--
-- Both business-rule refusals run before use_tap: a call that was always
-- going to be refused for a reason unrelated to the tap must never spend
-- one, the same ordering console_save_settings uses for its own input
-- validation ahead of its tap.
create or replace function public.console_invite_member(p_email text, p_role text, p_reason text, p_environment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_email  text := lower(p_email);
  v_role   console.member_role := p_role::console.member_role;
  v_token  text;
  v_id     uuid;
begin
  if exists (select 1 from console.members where email = v_email and status = 'active') then
    raise exception 'that address already belongs to a member' using errcode = '42501';
  end if;

  if exists (select 1 from console.invites where email = v_email and accepted_at is null and revoked_at is null) then
    raise exception 'an invite is already open for that address' using errcode = '42501';
  end if;

  perform console.use_tap('Invited a member', v_email, v_role::text, p_reason);

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into console.invites (email, role, invited_by, token_hash, sent_at, expires_at)
  values (v_email, v_role, v_member.user_id, extensions.digest(v_token, 'sha256'), now(), now() + interval '7 days')
  returning id into v_id;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Invited a member', v_email, p_reason, 'done', null,
    null, jsonb_build_object('role', v_role)
  );

  return jsonb_build_object('invite_id', v_id, 'token', v_token);
end;
$$;

-- Changing a role revokes every session the member holds (spec §C): a role
-- taken away must not go on working from a tab that is already open.
create or replace function public.console_change_role(p_member uuid, p_role text, p_reason text, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_role   console.member_role := p_role::console.member_role;
  v_target console.members;
begin
  -- Unconditional, and checked before the target is even read: the sheet's
  -- "Make someone else Owner first" is not merely the floor below, because
  -- it refuses a demotion of yourself even while another Owner stands ready
  -- to make the floor a non-issue.
  if p_member = v_member.user_id then
    raise exception 'a console needs at least one owner' using errcode = '42501';
  end if;

  select * into v_target from console.members where user_id = p_member and status <> 'removed' for update;
  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  if v_target.role = 'owner' and v_role is distinct from 'owner'::console.member_role then
    perform console.require_another_active_owner();
  end if;

  -- Bound to the member's id, never their name (two members cannot share an
  -- id, and 20260921100300_console_remove_key_binds_id.sql is exactly the
  -- branch review that found a name is not safe here).
  perform console.use_tap('Changed a role', p_member::text, v_role::text, p_reason);

  update console.members set role = v_role, updated_at = now() where user_id = p_member;

  perform public.console_auth_revoke_member_sessions(p_member, null);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Changed a role', v_target.email, p_reason, 'done', null,
    jsonb_build_object('role', v_target.role), jsonb_build_object('role', v_role)
  );
end;
$$;

-- The bulk equivalent of console_remove_key, run by an Owner on someone
-- else's account rather than by a member on their own: every key goes, not
-- down to a floor of two, and every session goes with them.
create or replace function public.console_reset_keys(p_member uuid, p_reason text, p_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_target console.members;
  v_count  integer;
begin
  select * into v_target from console.members where user_id = p_member and status <> 'removed' for update;
  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  select count(*) into v_count from console.keys where member_id = p_member;

  perform console.use_tap('Reset a member''s keys', p_member::text, v_count::text, p_reason);

  delete from console.keys where member_id = p_member;

  update console.members
     set keys_reset_at = now(), keys_reset_by = v_member.user_id, updated_at = now()
   where user_id = p_member;

  perform public.console_auth_revoke_member_sessions(p_member, null);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Reset a member''s keys', v_target.email, p_reason, 'done', null,
    jsonb_build_object('keys', v_count), jsonb_build_object('keys', 0)
  );

  return v_count;
end;
$$;

-- A soft delete: status becomes 'removed', the row (and the audit trail
-- naming it) stays. Same self-rule and same floor guard as
-- console_change_role, in the same order and for the same reason.
create or replace function public.console_remove_member(p_member uuid, p_reason text, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_target console.members;
begin
  if p_member = v_member.user_id then
    raise exception 'a console needs at least one owner' using errcode = '42501';
  end if;

  select * into v_target from console.members where user_id = p_member and status <> 'removed' for update;
  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  if v_target.role = 'owner' then
    perform console.require_another_active_owner();
  end if;

  perform console.use_tap('Removed a member', p_member::text, v_target.role::text, p_reason);

  update console.members set status = 'removed', updated_at = now() where user_id = p_member;

  perform public.console_auth_revoke_member_sessions(p_member, null);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Removed a member', v_target.email, p_reason, 'done', null,
    jsonb_build_object('status', v_target.status), jsonb_build_object('status', 'removed')
  );
end;
$$;

-- No tap, no p_reason: resending re-sends a letter to an address an Owner
-- already approved, and changes no access -- the same rename-versus-remove
-- reasoning 2d-1 used (Task 7's own ruling). A fresh token means the old
-- letter's link stops working the moment a new one is sent.
create or replace function public.console_resend_invite(p_invite uuid, p_environment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_invite console.invites;
  v_token  text;
begin
  select * into v_invite from console.invites where id = p_invite for update;
  if not found or v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    raise exception 'no access' using errcode = '42501';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'that invite has expired' using errcode = '42501';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update console.invites
     set token_hash = extensions.digest(v_token, 'sha256'),
         sent_at = now(),
         expires_at = now() + interval '7 days'
   where id = p_invite;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Resent an invite', v_invite.email, null, 'done', null, null, null
  );

  return jsonb_build_object('invite_id', v_invite.id, 'token', v_token);
end;
$$;

-- Revoking withdraws access that was granted, so it takes a tap -- the
-- other half of Task 7's ruling. Bound to the invite's own id: an email can
-- hold at most one live invite today, but the id is what the row actually
-- is, the same choice console_remove_key's id-bound digest made
-- (20260921100300_console_remove_key_binds_id.sql).
create or replace function public.console_revoke_invite(p_invite uuid, p_reason text, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_invite console.invites;
begin
  select * into v_invite from console.invites where id = p_invite for update;
  if not found or v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    raise exception 'no access' using errcode = '42501';
  end if;

  perform console.use_tap('Revoked an invite', p_invite::text, v_invite.email, p_reason);

  update console.invites set revoked_at = now() where id = p_invite;

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Revoked an invite', v_invite.email, p_reason, 'done', null, null, null
  );
end;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so all three are
-- named in the revoke here too, even though authenticated is the one
-- granted back below -- naming only public and anon would leave that
-- default standing for service_role and anon.
revoke all on function
  public.console_team(),
  public.console_invite_member(text, text, text, text),
  public.console_change_role(uuid, text, text, text),
  public.console_reset_keys(uuid, text, text),
  public.console_remove_member(uuid, text, text),
  public.console_resend_invite(uuid, text),
  public.console_revoke_invite(uuid, text, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_team(),
  public.console_invite_member(text, text, text, text),
  public.console_change_role(uuid, text, text, text),
  public.console_reset_keys(uuid, text, text),
  public.console_remove_member(uuid, text, text),
  public.console_resend_invite(uuid, text),
  public.console_revoke_invite(uuid, text, text)
to authenticated;
