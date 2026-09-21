-- Binding a per-action tap to the ceremony that answered it.
--
-- Until this migration nothing anywhere recorded that a key had answered a
-- tap. verifyTap (src/console/keys/tap.ts) verified the assertion and wrote
-- nothing; console_auth_read_challenge is `language sql stable` and cannot
-- write; console_auth_touch_key only bumps a counter. So console.use_tap
-- matched on member, session, purpose, expiry, unspent-ness and digest -- and
-- a caller who simply skipped the ceremony satisfied every one of them: POST
-- /api/tap/options followed by DELETE /api/keys/mine removed a key with no
-- WebAuthn at all, and the audit row read `result = 'done'`. Proven end to end
-- with every virtual authenticator detached, in
-- tests/e2e/console-auth/my-keys.spec.ts.
--
-- The 2c ceremonies never had this hole: ceremony.ts spends its challenge at
-- verify, so a skipped ceremony leaves nothing to spend. The per-action tap is
-- the one that deliberately leaves the challenge unspent -- the action itself
-- spends it, inside the database, in the same transaction as its own write --
-- and that is exactly why it needs a second fact of its own.

alter table console.challenges add column verified_at timestamptz;

-- The fact use_tap was missing. Service-role only: the Next.js server has just
-- verified the assertion with @simplewebauthn and is the only party in a
-- position to assert this, while a member's own session must never be able to
-- mark its own challenge answered -- that is the whole bypass being closed.
--
-- Every parameter is text or uuid and never console.challenge_purpose:
-- PostgREST performs an enum cast in the CALLING role's context, before the
-- function body and therefore its owner's elevated privilege ever runs, and
-- service_role deliberately has no usage on schema console -- so an enum
-- parameter here would die with "permission denied for schema console".
-- 20260921000000_console_enum_args_as_text.sql exists solely to undo five of
-- those; this one is written that way from the start.
--
-- The purpose is not a parameter at all: it is pinned to 'action' inside the
-- body. A sign_in, add_key or add_key_tap challenge must never be markable
-- through this path, and the way to guarantee that is to give the caller no
-- say in it.
create or replace function public.console_auth_verify_challenge(
  p_challenge text,
  p_member    uuid,
  p_session   uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update console.challenges
     set verified_at = now()
   where challenge = p_challenge
     and member_id = p_member
     and session_id = p_session
     and purpose = 'action'
     and used_at is null
     and expires_at > now()
  returning id into v_id;

  -- Whether a row was marked, never which one: the caller already knows the
  -- challenge it asked about, and a null id is the only thing it can act on.
  return v_id is not null;
end;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so service_role is
-- named in the revoke too, even though it is the role granted back below.
revoke all on function public.console_auth_verify_challenge(text, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.console_auth_verify_challenge(text, uuid, uuid)
to service_role;

-- console.use_tap, unchanged but for one line: `and verified_at is not null`.
-- Everything the original said about per-field hashing, about ordering and
-- about `for update skip locked` still holds and is left where it was
-- (20260920090400_console_guard.sql); only the predicate grew a condition.
--
-- Note this sits in the inner select, beside the other five conditions, rather
-- than in the outer update: the outer update matches by id alone, so a
-- condition added there would be checked against a row the inner select had
-- already chosen -- and `limit 1` would have skipped a verified sibling to pick
-- an unverified one, then refused.
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
        and verified_at is not null
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
