-- The one statement the owner runs in the Supabase SQL editor to start the
-- console, and the redemption the server performs when the link is opened.
-- There is no invite to accept here, because there is nobody yet to send one.

-- Shared by both functions below, so the guard's meaning lives in exactly one
-- place. It also has no caller of its own: revoked from every role, the same
-- as create_first_owner_link, since letting it stand alone would only be
-- another way to leak whether the console already has an Owner.
create or replace function console.has_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from console.members where role = 'owner' and status <> 'removed'
  );
$$;

revoke all on function console.has_owner() from public, anon, authenticated, service_role;

create or replace function console.create_first_owner_link(
  p_email    text,
  p_base_url text default 'https://admin.trakline.in'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if console.has_owner() then
    raise exception 'the console already has an Owner';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into console.setup_links (email, token_hash, expires_at)
  values (lower(p_email), extensions.digest(v_token, 'sha256'), now() + interval '24 hours');

  return p_base_url || '/setup?token=' || v_token;
end;
$$;

-- Run only from the Supabase SQL editor, as the owner of the database: no
-- role is granted execute, not even service_role. Losing a link before it is
-- redeemed is a real scenario, so this stays free to issue more than one --
-- the redemption side below is what makes only the first one count.
revoke all on function console.create_first_owner_link(text, text) from public, anon, authenticated, service_role;

create or replace function public.console_auth_redeem_setup_link(
  p_token_hash  bytea,
  p_user        uuid,
  p_email       text,
  p_name        text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   console.setup_links;
  v_member console.members;
begin
  -- Redemption happens once in the console's life, and two links redeemed at
  -- the same moment would both pass an unlocked guard: has_owner() is a
  -- plain, unlocked read under READ COMMITTED, so two concurrent callers
  -- could each see "no Owner yet", each pass, and each insert their own
  -- member row before either commits. Serialise them first.
  perform pg_advisory_xact_lock(hashtext('console.first_owner'));

  -- The same guard `create_first_owner_link` uses. Matching on `active` alone
  -- would let a second link redeem while the first Owner is still in setup,
  -- and the console would have two Owners.
  if console.has_owner() then
    return null;
  end if;

  -- Read the link first and spend it last: a mismatch below must leave it live,
  -- and returning null raises nothing, so nothing would roll back.
  select * into v_link
    from console.setup_links
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
     and email = lower(p_email)
   for update;

  if not found then
    return null;
  end if;

  -- The token proves someone holds the link; this proves it is the person it
  -- was made for. `p_email` is the caller's word; `auth.users` is not.
  if not exists (
    select 1 from auth.users u
     where u.id = p_user and lower(u.email) = v_link.email
  ) then
    return null;
  end if;

  update console.setup_links set used_at = now() where id = v_link.id;

  -- has_owner() treats a removed Owner as "no Owner", so the console can be
  -- recovered -- but that removed Owner's own console.members row still
  -- exists at their user_id. Mirror console_auth_accept_invite's own upsert
  -- so reinstating them updates that row instead of raising a unique
  -- violation against it.
  insert into console.members (user_id, email, name, role, status)
  values (p_user, v_link.email, p_name, 'owner', 'setup')
  on conflict (user_id) do update set role = excluded.role, status = 'setup'
  returning * into v_member;

  perform console.write_audit(
    p_environment, p_user, p_name, 'owner', null, null,
    'team', 'First Owner created', v_link.email, null, 'done', null, null,
    jsonb_build_object('role', 'owner')
  );

  return to_jsonb(v_member);
end;
$$;

-- Supabase's default privileges on the public schema auto-grant EXECUTE on a
-- new function to anon, authenticated and service_role alike, so service_role
-- must be named in the revoke here too, even though it is the very role about
-- to be granted back below.
revoke all on function public.console_auth_redeem_setup_link(bytea, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.console_auth_redeem_setup_link(bytea, uuid, text, text, text) to service_role;
