-- An address that already has a traveller account cannot be invited.
--
-- Spec §E line 103 says so, and ConsoleTeam.dc.html draws the refusal it
-- produces (dlg_refused, :232-259: "This address already has a Trakline
-- account. Invite a dedicated console address."). console_invite_member
-- checked two things and neither was that one -- a console.members row that is
-- not 'removed', and a live console.invites row -- so the drawn state was
-- unreachable and the spec rule was unimplemented. Found while building Task 4
-- (task-4-addendum.md §2); closed here.
--
-- The new check runs AFTER both existing ones, deliberately. Every console
-- member also has an auth.users row, so a traveller check placed first would
-- answer "already has a Trakline account" for someone who is plainly already a
-- member -- the vaguer message winning over the specific one. The two
-- membership assertions in supabase/tests/console_team.test.sql (Devi, active;
-- Meera, still in setup) are that ordering's proof: both of those addresses are
-- in auth.users too, so either one going wrong is a failed test, not a subtle
-- change of wording.
--
-- One exemption, ruled on by the owner rather than invented here: a REMOVED
-- member keeps their auth.users row, so the rule read literally would refuse
-- them for good. Removal must not be permanent, so the check below lets an
-- address through when its only console.members row is 'removed'. See the
-- check itself for why that is narrow.
--
-- Everything else about this function is unchanged, and its original comments
-- are carried over verbatim (20260922090000_console_team.sql).
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
  -- `<> 'removed'`, not `= 'active'`: a member who accepted an invite but has not finished adding
  -- their two keys sits in 'setup', and they are already a member -- inviting them a second time
  -- would mint a second live invite against a member row that exists. An Owner helping someone
  -- stuck there resets their keys; they do not re-invite them. The two functions below already
  -- read membership this way, so this is the file agreeing with itself.
  if exists (select 1 from console.members where email = v_email and status <> 'removed') then
    raise exception 'that address already belongs to a member' using errcode = '42501';
  end if;

  if exists (select 1 from console.invites where email = v_email and accepted_at is null and revoked_at is null) then
    raise exception 'an invite is already open for that address' using errcode = '42501';
  end if;

  -- Spec §E line 103, with one exemption the owner ruled on. `lower(u.email)`,
  -- not `u.email`: v_email is already lower-cased above, and an Owner who typed
  -- a capital must not be able to walk straight past this rule. It costs the
  -- partial index on auth.users (email), which is the right trade for a check
  -- that runs once per invite. This function is `security definer` with
  -- `set search_path = ''`, so it may read auth.users by its fully-qualified
  -- name; its caller may not.
  --
  -- The exemption: removal never touches auth.users, so read literally this
  -- rule would lock a removed member out for good -- there is no "unremove",
  -- and this function is the only way back in. So an address is let through
  -- when console.members still holds a row for it, which by this point can
  -- only be a 'removed' one: the first check above already refused every other
  -- status. `status = 'removed'` is written out rather than left implicit,
  -- because the two checks being read together is the only thing that makes
  -- the shorter form correct, and a later edit to either one should not be
  -- able to widen this silently.
  --
  -- An address with a traveller account and no member row at all is still
  -- refused, which is the case the sheet draws.
  --
  -- console_auth_accept_invite already lands a re-invite correctly: its insert
  -- is `on conflict (user_id) do update set role, status = 'setup', name`, and
  -- a removed member keeps both their user_id and their email, so accepting
  -- reactivates the row they already have rather than colliding with
  -- console_members_email_key.
  if exists (select 1 from auth.users u where lower(u.email) = v_email)
     and not exists (select 1 from console.members where email = v_email and status = 'removed')
  then
    raise exception 'that address already has a Trakline account' using errcode = '42501';
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

-- `create or replace` keeps the existing grants, but they are restated here so
-- this file says on its own what may call the function it defines.
revoke all on function public.console_invite_member(text, text, text, text) from public, anon, service_role;
grant execute on function public.console_invite_member(text, text, text, text) to authenticated;
