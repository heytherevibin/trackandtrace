-- The one statement the owner runs in the Supabase SQL editor to start the
-- console, and the redemption the server performs when the link is opened.
-- There is no invite to accept here, because there is nobody yet to send one.

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
  if exists (select 1 from console.members where role = 'owner' and status <> 'removed') then
    raise exception 'the console already has an Owner';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into console.setup_links (email, token_hash, expires_at)
  values (lower(p_email), extensions.digest(v_token, 'sha256'), now() + interval '24 hours');

  return p_base_url || '/setup?token=' || v_token;
end;
$$;

-- Run only from the Supabase SQL editor, as the owner of the database: no
-- role is granted execute, not even service_role.
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
  -- The same guard `create_first_owner_link` uses. Matching on `active` alone
  -- would let a second link redeem while the first Owner is still in setup,
  -- and the console would have two Owners.
  if exists (select 1 from console.members where role = 'owner' and status <> 'removed') then
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

  insert into console.members (user_id, email, name, role, status)
  values (p_user, v_link.email, p_name, 'owner', 'setup')
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
