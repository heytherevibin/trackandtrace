-- A member cannot reset their own keys.
--
-- console_reset_keys shipped with no self-check (20260922090000_console_team.sql:218), on the
-- stated reasoning that a self-reset was "recoverable, and consistent with My keys letting a member
-- remove their own keys". Both halves are false, and the second is exactly inverted. The Task 6
-- review caught it; every link below was then re-traced against the migrations rather than taken on
-- anyone's word.
--
-- My keys holds the OPPOSITE rule. console_remove_key refuses at
-- 20260921100000_console_my_keys.sql:113 -- `if v_remaining < 2 then raise 'a member must keep at
-- least two keys'` -- and that floor exists precisely so a member can never reach zero. My keys is
-- the one surface in this console designed to make self-lockout impossible. console_reset_keys
-- deletes every key a member has.
--
-- What happened to a member who reset their own keys, step by step:
--
--  1. Every key deleted and every session revoked. The function never touches `status`, so the row
--     stays whatever it was -- for an Owner, `role='owner', status='active'` with zero keys.
--     keys_reset_at/keys_reset_by are stamped and nothing in the repo reads either one.
--  2. They cannot sign in. Sign-in's second factor is a key, and they have none.
--  3. They cannot be re-invited. console_invite_member refuses any address whose console.members
--     row is `status <> 'removed'` (20260922110000:60) -- and that file's own comment sends an Owner
--     helping someone stuck in setup to *reset their keys*, which is circular once the keys are
--     already gone.
--  4. Nothing puts them back into enrolment. console_auth_activate_member only updates
--     `where user_id = p_member and status = 'setup'` (20260920091100:47), and returns false for
--     anyone under two keys anyway.
--  5. No fresh first-Owner link. console.create_first_owner_link raises while console.has_owner()
--     is true, and has_owner() counts `role='owner' and status <> 'removed'`
--     (20260920090800:16,35) -- which is still them.
--
-- With a second Owner there is a way back (remove them, then invite them fresh), undocumented and
-- non-obvious. For a console's only Owner there is no supported recovery at all: the remaining
-- route is hand-editing console.members. And the screen that offers this draws
-- "... will add two new keys at next sign-in" (ConsoleTeam.dc.html:293) -- a promise about a
-- sign-in that cannot happen.
--
-- So the action is refused outright rather than guarded by Owner count. It has no legitimate use:
-- a member who wants fresh keys adds new ones and removes the old ones under My keys' own floor,
-- which never passes through zero; and a member who has LOST their keys cannot sign in to reach
-- this function in the first place -- an Owner resets theirs, which is what the function is for.
-- Unconditional, like console_remove_member's own self-rule and for a stronger reason: that one
-- protects the console, this one protects the member from a one-tap lockout of themselves.
--
-- Everything else about this function is unchanged, and its original comments are carried over
-- verbatim (20260922090000_console_team.sql).
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
  -- First, before the target row is read and before any lock is taken: there is nothing about the
  -- target worth learning when the answer is no whatever it says. The same placement
  -- console_change_role and console_remove_member give their own self-checks.
  --
  -- Its own message, not their 'a console needs at least one owner': this refusal is not about
  -- Owners or about the console's floor. A Viewer resetting their own keys locks themselves out
  -- just as completely; only the size of the mess left behind differs.
  if p_member = v_member.user_id then
    raise exception 'a member cannot reset their own keys' using errcode = '42501';
  end if;

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

-- `create or replace` keeps the existing grants, but they are restated here so
-- this file says on its own what may call the function it defines.
revoke all on function public.console_reset_keys(uuid, text, text) from public, anon, service_role;
grant execute on function public.console_reset_keys(uuid, text, text) to authenticated;
