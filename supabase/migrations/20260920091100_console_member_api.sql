-- The one call a signed-in member makes about themselves, and the two the
-- server makes on their behalf while they are still signing in.

-- Every console surface runs this first. It returns nothing a member does not
-- already know, and it is the only public function granted to `authenticated`
-- besides console_save_settings -- because console.current_member() is what
-- actually checks the session: key-verified, unrevoked, inside its week, used
-- within the last 24 hours, and belonging to an active member. It also moves
-- last_seen_at, so it writes: every caller must reach it with POST.
create or replace function public.console_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.current_member();
begin
  return jsonb_build_object(
    'user_id', v_member.user_id,
    'email',   v_member.email,
    'name',    v_member.name,
    'role',    v_member.role,
    'status',  v_member.status
  );
end;
$$;

-- Setup ends when the member holds two keys, never before: spec §D's enrolment
-- rule and the removal rule ("a key can't be removed if that would leave fewer
-- than two") are the same rule seen from both ends. The count is read here
-- rather than trusted from the caller, and `status = 'setup'` in the update
-- means a removed member is never quietly reinstated by adding keys.
create or replace function public.console_auth_activate_member(p_member uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from console.keys k where k.member_id = p_member) < 2 then
    return false;
  end if;

  update console.members
     set status = 'active', updated_at = now()
   where user_id = p_member and status = 'setup';

  -- Reports the state, not whether this call is what produced it: a second
  -- request for an already-active member is a no-op that still answers "active".
  return exists (select 1 from console.members m where m.user_id = p_member and m.status = 'active');
end;
$$;

-- take_challenge spends what it returns, and console.use_tap() requires an
-- unspent row -- so the per-action flow in §D (verify the tap, then let the
-- database spend it while the action runs) has no way to check a challenge
-- first. This is that check: the same predicate, without the update. Added
-- now, with no caller, so 2e cannot be built on the consuming read by mistake.
create or replace function public.console_auth_read_challenge(
  p_challenge text,
  p_member    uuid,
  p_purpose   console.challenge_purpose
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c)
    from console.challenges c
   where c.challenge = p_challenge
     and c.member_id = p_member
     and c.purpose = p_purpose
     and c.used_at is null
     and c.expires_at > now();
$$;

-- The key step runs before a session is key-verified, which is precisely what
-- console.current_member() refuses -- so the pre-guard cannot go through it.
-- This is the same set of conditions, read rather than enforced, and without
-- moving last_seen_at: a member is working when they call a member function,
-- not when the server checks whether they may.
create or replace function public.console_auth_session(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id',   s.session_id,
    'member_id',    m.user_id,
    'email',        m.email,
    'name',         m.name,
    'role',         m.role,
    'status',       m.status,
    'key_verified', s.key_verified_at is not null,
    'key_count',    (select count(*) from console.keys k where k.member_id = m.user_id)
  )
  from console.sessions s
  join console.members m on m.user_id = s.member_id
  where s.session_id = p_session_id
    and s.revoked_at is null
    and s.expires_at > now()
    and s.last_seen_at > now() - interval '24 hours'
    and m.status <> 'removed';
$$;

-- Redeeming a first-Owner link needs an auth.users id, and the server can only
-- get one by knowing which address the link was made for -- which is inside the
-- row. So the address is readable while the link is live, and invisible the
-- moment it is spent or expires. console_auth_redeem_setup_link stays the only
-- thing that may spend one.
create or replace function public.console_auth_setup_link(p_token_hash bytea)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('email', l.email)
    from console.setup_links l
   where l.token_hash = p_token_hash
     and l.used_at is null
     and l.expires_at > now();
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so each of the three
-- is named in the revoke even where it is the role about to be granted back.
revoke all on function public.console_me() from public, anon, authenticated, service_role;
grant execute on function public.console_me() to authenticated;

revoke all on function
  public.console_auth_activate_member(uuid),
  public.console_auth_read_challenge(text, uuid, console.challenge_purpose),
  public.console_auth_session(uuid),
  public.console_auth_setup_link(bytea)
from public, anon, authenticated, service_role;

grant execute on function
  public.console_auth_activate_member(uuid),
  public.console_auth_read_challenge(text, uuid, console.challenge_purpose),
  public.console_auth_session(uuid),
  public.console_auth_setup_link(bytea)
to service_role;
