-- Removing a member deletes their security keys.
--
-- console_remove_member shipped revoking every session and leaving console.keys untouched
-- (20260922090000_console_team.sql:294). That is what dead-ends a re-invited member, permanently
-- and with nothing on screen to say so. The whole-branch review proved the path by execution --
-- real functions, real taps, one rolled-back transaction -- and it is reproduced here because
-- reading the five steps is the only way the fix looks proportionate:
--
--  1. An Owner removes Kiran, an Admin holding the two keys every active member must have.
--     `status='removed'`, every session revoked, `keys_kept=2`.
--  2. The Owner invites kiran@... again. Allowed, and deliberately so: Ruling 17 exempts an address
--     whose only console.members row is 'removed' from the traveller check
--     (20260922110000_console_invite_blocks_traveller.sql), because removal must not be permanent.
--  3. Kiran accepts. console_auth_accept_invite upserts `on conflict (user_id)`, so the row she
--     already has becomes `role='viewer', status='setup'` -- and her two old keys are still on it.
--  4. She opens her sign-in link. console_auth_member_by_email answers `status=setup, key_count=2`,
--     so nextAfterConfirm (src/console/auth/session.ts:59) sends her to /sign-in-key rather than
--     /setup -- and /setup would bounce her back out anyway (src/app/console/setup/page.tsx:40
--     redirects any link session already holding two keys).
--  5. She taps one of the old keys. The session key-verifies, and then console.current_member()
--     (20260920090400_console_guard.sql:63) refuses it: that function requires `status='active'`,
--     and only console_auth_activate_member moves setup -> active. Its one caller is
--     completeRegistration (src/console/keys/ceremony.ts:304) -- i.e. *adding* a key, the step she
--     can never reach. Every console page answers `28000 session ended`, forever.
--
-- Her roster row meanwhile reads "Setup incomplete · 2 keys", indistinguishable from any ordinary
-- member mid-setup, so the Owner gets no signal either. The one recovery is an Owner thinking to
-- press Reset keys on her, which nothing in the product or the runbook names.
--
-- The fix is here rather than in console_auth_accept_invite or in nextAfterConfirm because this is
-- where the wrong thing happens: removal revokes access, and a key is access material. Keeping
-- credentials alive for a row that can no longer sign in has no upside -- nothing in this repo
-- reads a removed member's keys, and a member who comes back adds fresh ones the way any new member
-- does. The other two candidates both change a rule that is right today: accept_invite would have
-- to special-case a status it otherwise does not care about, and routing on status instead of key
-- count reaches the first-Owner and keys-cleared paths as well.
--
-- Two smaller consequences, both wanted. A removed member's credential_id leaves
-- console_keys_credential_key, so the same physical key can be enrolled again -- by them on their
-- way back, or by anyone else it now belongs to. And the count that went is written into the audit
-- row's before/after, the same shape console_reset_keys already writes, because destroying
-- credentials is exactly the kind of act the audit log exists to hold.
--
-- Everything else about this function is unchanged, and its original comments are carried over
-- verbatim (20260922090000_console_team.sql).
create or replace function public.console_remove_member(p_member uuid, p_reason text, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('owner');
  v_target console.members;
  v_keys   integer;
begin
  if p_member = v_member.user_id then
    raise exception 'a console needs at least one owner' using errcode = '42501';
  end if;

  -- Every active Owner is locked here, in user_id order, before the target row below.
  -- require_another_active_owner() further down takes exactly this lock; taking the *target's* row
  -- first instead let two Owners each holding the other's row wait on each other, which Postgres
  -- breaks by aborting one with 40P01 rather than the orderly queue this file claimed. Harmless
  -- when the target is not an Owner: a handful of rows, held for one console action. Not needed in
  -- console_reset_keys, which takes no owner-set lock and so can close no cycle.
  perform 1 from console.members where role = 'owner' and status = 'active' order by user_id for update;

  select * into v_target from console.members where user_id = p_member and status <> 'removed' for update;
  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  if v_target.role = 'owner' then
    perform console.require_another_active_owner();
  end if;

  -- The digest is unchanged: action, the member's id, the role they hold today, reason. The key
  -- count is deliberately NOT bound into it, unlike console_reset_keys' -- a removal is about the
  -- person, and an Owner who taps Remove means it whether or not somebody added a key in between.
  perform console.use_tap('Removed a member', p_member::text, v_target.role::text, p_reason);

  update console.members set status = 'removed', updated_at = now() where user_id = p_member;

  -- Counted and deleted inside the same transaction as the status change, and before the sessions
  -- are revoked, so no ordering leaves a window where the row is 'removed' and the keys still
  -- answer. console.sessions.key_id is `on delete set null` (20260920090100:25), so a session row
  -- that named one of these keys survives the delete and is revoked a line below, as before.
  select count(*) into v_keys from console.keys where member_id = p_member;
  delete from console.keys where member_id = p_member;

  perform public.console_auth_revoke_member_sessions(p_member, null);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'team', 'Removed a member', v_target.email, p_reason, 'done', null,
    jsonb_build_object('status', v_target.status, 'keys', v_keys), jsonb_build_object('status', 'removed', 'keys', 0)
  );
end;
$$;

-- `create or replace` keeps the existing grants, but they are restated here so
-- this file says on its own what may call the function it defines.
revoke all on function public.console_remove_member(uuid, text, text) from public, anon, service_role;
grant execute on function public.console_remove_member(uuid, text, text) to authenticated;
