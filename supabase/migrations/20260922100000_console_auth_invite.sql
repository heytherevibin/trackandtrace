-- The one read an invited member's browser can make before any session exists.
--
-- console_auth_accept_invite (2b, console_auth_keys.sql) has always needed an auth.users id to do
-- anything, and its own null return already folds "no such token", "already accepted", "expired"
-- and "revoked" into one answer -- correct for accepting, wrong for Task 2b's sheet
-- (ConsoleSetup.dc.html), which draws "Invite expired" and "Invite withdrawn" as two different
-- screens. A browser holding a raw token has no session to ask console_team with, and the console
-- schema is granted to no role -- every read of it goes through a public.console_* function, the
-- same reason console_auth_setup_link exists for a first-Owner link. This is that function's
-- sibling for an invite: readable while live *and* while merely closed (expired or withdrawn, but
-- not yet accepted), so the caller can tell those two apart -- and spending one is still
-- console_auth_accept_invite's alone.
create or replace function public.console_auth_invite(p_token_hash bytea)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email',     i.email,
    'role',      i.role,
    'expired',   i.expires_at <= now(),
    'withdrawn', i.revoked_at is not null
  )
  from console.invites i
  where i.token_hash = p_token_hash
    and i.accepted_at is null;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema function to anon,
-- authenticated and service_role alike, so each is named in the revoke even where it is the role
-- about to be granted back.
revoke all on function public.console_auth_invite(bytea) from public, anon, authenticated, service_role;
grant execute on function public.console_auth_invite(bytea) to service_role;
