-- Keys, invites and the Owner list, for the server to call with the service role.

create or replace function public.console_auth_keys_for_member(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', k.id,
      'credential_id', encode(k.credential_id, 'base64'),
      'public_key', encode(k.public_key, 'base64'),
      'counter', k.counter,
      'transports', k.transports
    ) order by k.created_at),
    '[]'::jsonb
  )
  from console.keys k
  where k.member_id = p_member;
$$;

create or replace function public.console_auth_record_key(
  p_member        uuid,
  p_credential_id bytea,
  p_public_key    bytea,
  p_counter       bigint,
  p_transports    text[],
  p_name          text,
  p_type          console.key_type
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into console.keys (member_id, credential_id, public_key, counter, transports, name, type)
  values (p_member, p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'), p_name, p_type)
  returning id;
$$;

-- A key's counter is the authenticator's own clock: it only ever goes up.
create or replace function public.console_auth_touch_key(p_key uuid, p_counter bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update console.keys
     set counter = greatest(counter, p_counter),
         last_used_at = now()
   where id = p_key;
$$;

create or replace function public.console_auth_accept_invite(p_token_hash bytea, p_user uuid, p_name text, p_environment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite console.invites;
  v_member console.members;
begin
  select * into v_invite
    from console.invites
   where token_hash = p_token_hash
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   for update;

  if not found then
    return null;
  end if;

  -- The token proves someone holds the invite; this proves it is the person it
  -- was sent to. Without it, any live invite could be redeemed against any
  -- member row, resetting that member's role.
  if not exists (
    select 1 from auth.users u
     where u.id = p_user and lower(u.email) = v_invite.email
  ) then
    return null;
  end if;

  update console.invites set accepted_at = now() where id = v_invite.id;

  insert into console.members (user_id, email, name, role, status, invited_by)
  values (p_user, v_invite.email, p_name, v_invite.role, 'setup', v_invite.invited_by)
  on conflict (user_id) do update set role = excluded.role, status = 'setup'
  returning * into v_member;

  perform console.write_audit(
    p_environment, p_user, p_name, v_invite.role, null, null,
    'team', 'Invite accepted', v_invite.email, null, 'done', null, null,
    jsonb_build_object('role', v_invite.role)
  );

  return to_jsonb(v_member);
end;
$$;

create or replace function public.console_auth_owner_addresses()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.email order by m.email), '{}')
  from console.members m
  where m.role = 'owner' and m.status = 'active';
$$;

create or replace function public.console_auth_write_audit(
  p_environment   text,
  p_actor         uuid,
  p_actor_name    text,
  p_actor_role    console.member_role,
  p_key_id        uuid,
  p_session_label text,
  p_category      text,
  p_action        text,
  p_target        text,
  p_reason        text,
  p_result        console.audit_result,
  p_address_hash  text,
  p_before        jsonb,
  p_after         jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select console.write_audit(
    p_environment, p_actor, p_actor_name, p_actor_role, p_key_id, p_session_label,
    p_category, p_action, p_target, p_reason, p_result, p_address_hash, p_before, p_after
  );
$$;

-- Supabase's default privileges on the public schema auto-grant EXECUTE on a
-- new function to anon, authenticated and service_role alike, so service_role
-- must be named in the revoke here too, even though it is the very role about
-- to be granted back below -- naming only public, anon and authenticated
-- would leave that default standing, and none of these may be reached except
-- through the service role while it registers keys, turns an invite into a
-- member, reads the Owner list for Security email, or logs something that
-- happened outside a member function.
revoke all on function
  public.console_auth_keys_for_member(uuid),
  public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type),
  public.console_auth_touch_key(uuid, bigint),
  public.console_auth_accept_invite(bytea, uuid, text, text),
  public.console_auth_owner_addresses(),
  public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_auth_keys_for_member(uuid),
  public.console_auth_record_key(uuid, bytea, bytea, bigint, text[], text, console.key_type),
  public.console_auth_touch_key(uuid, bigint),
  public.console_auth_accept_invite(bytea, uuid, text, text),
  public.console_auth_owner_addresses(),
  public.console_auth_write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb)
to service_role;
