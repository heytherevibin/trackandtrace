-- Runtime settings: one row per environment, every switch nullable so null
-- always means "the deployment's default". The audit log holds the history.

create table console.settings (
  environment                text primary key check (environment in ('production', 'preview', 'development')),
  checks_paused              boolean,
  checks_paused_message      text check (checks_paused_message is null or char_length(checks_paused_message) between 1 and 200),
  primary_source             text check (primary_source is null or primary_source in ('railkit', 'rapidapi')),
  fallback_source            text check (fallback_source is null or fallback_source in ('none', 'railkit', 'rapidapi')),
  new_accounts_open          boolean,
  traveller_passkey_enabled  boolean,
  site_notice_on             boolean,
  site_notice_text           text check (site_notice_text is null or char_length(site_notice_text) between 1 and 200),
  site_notice_version        integer check (site_notice_version is null or site_notice_version >= 1),
  checks_per_address         integer check (checks_per_address is null or checks_per_address between 5 and 60),
  live_checks_per_day        integer check (live_checks_per_day is null or live_checks_per_day between 1 and 1000000),
  version                    integer not null default 1,
  changed_at                 timestamptz not null default now(),
  changed_by                 uuid references console.members (user_id) on delete set null
);

insert into console.settings (environment) values ('production'), ('preview'), ('development');

revoke all on console.settings from anon, authenticated;

-- The traveller path reads through the server, which holds the service role.
create or replace function public.console_auth_read_settings(p_environment text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s) from console.settings s where s.environment = p_environment;
$$;

revoke all on function public.console_auth_read_settings(text) from public, anon, authenticated;
grant execute on function public.console_auth_read_settings(text) to service_role;

-- One function applies a change: it takes a tap, checks the version, applies
-- every field and writes one audit row per changed field, all in one
-- transaction. A failed save changes nothing, as the Switches sheet promises.
create or replace function public.console_save_settings(
  p_environment text,
  p_version     integer,
  p_changes     jsonb,
  p_reason      text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member  console.members := console.require_role('admin');
  v_known   text[] := array[
    'checks_paused', 'checks_paused_message', 'primary_source', 'fallback_source',
    'new_accounts_open', 'traveller_passkey_enabled', 'site_notice_on', 'site_notice_text',
    'site_notice_version', 'checks_per_address', 'live_checks_per_day'
  ];
  v_key     text;
  v_current console.settings;
  v_new     console.settings;
  v_before  jsonb;
  v_after   jsonb;
begin
  if jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'nothing to save' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any (v_known)) then
      raise exception 'unknown setting %', v_key using errcode = '22023';
    end if;
  end loop;

  perform console.use_tap('settings.save', p_environment, p_changes::text, p_reason);

  select * into v_current from console.settings where environment = p_environment for update;
  if not found then
    raise exception 'unknown environment' using errcode = '22023';
  end if;
  if v_current.version <> p_version then
    raise exception 'stale version' using errcode = '40001';
  end if;

  update console.settings set
    checks_paused             = case when p_changes ? 'checks_paused' then (p_changes ->> 'checks_paused')::boolean else checks_paused end,
    checks_paused_message     = case when p_changes ? 'checks_paused_message' then p_changes ->> 'checks_paused_message' else checks_paused_message end,
    primary_source            = case when p_changes ? 'primary_source' then p_changes ->> 'primary_source' else primary_source end,
    fallback_source           = case when p_changes ? 'fallback_source' then p_changes ->> 'fallback_source' else fallback_source end,
    new_accounts_open         = case when p_changes ? 'new_accounts_open' then (p_changes ->> 'new_accounts_open')::boolean else new_accounts_open end,
    traveller_passkey_enabled = case when p_changes ? 'traveller_passkey_enabled' then (p_changes ->> 'traveller_passkey_enabled')::boolean else traveller_passkey_enabled end,
    site_notice_on            = case when p_changes ? 'site_notice_on' then (p_changes ->> 'site_notice_on')::boolean else site_notice_on end,
    site_notice_text          = case when p_changes ? 'site_notice_text' then p_changes ->> 'site_notice_text' else site_notice_text end,
    site_notice_version       = case when p_changes ? 'site_notice_version' then (p_changes ->> 'site_notice_version')::integer else site_notice_version end,
    checks_per_address        = case when p_changes ? 'checks_per_address' then (p_changes ->> 'checks_per_address')::integer else checks_per_address end,
    live_checks_per_day       = case when p_changes ? 'live_checks_per_day' then (p_changes ->> 'live_checks_per_day')::integer else live_checks_per_day end,
    version                   = version + 1,
    changed_at                = now(),
    changed_by                = v_member.user_id
  where environment = p_environment
  returning * into v_new;

  for v_key in select jsonb_object_keys(p_changes) loop
    v_before := to_jsonb(v_current) -> v_key;
    v_after  := to_jsonb(v_new) -> v_key;
    if v_before is distinct from v_after then
      perform console.write_audit(
        p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
        'settings', 'Setting changed', v_key, p_reason, 'done', null,
        jsonb_build_object(v_key, v_before), jsonb_build_object(v_key, v_after)
      );
    end if;
  end loop;

  return v_new.version;
end;
$$;

-- Supabase's default privileges on the public schema auto-grant EXECUTE on a
-- new function to anon, authenticated and service_role alike, so service_role
-- must be revoked explicitly here too -- naming only public and anon would
-- leave the server's own elevated role able to call the save path, which only
-- a member's own authenticated session may do.
revoke all on function public.console_save_settings(text, integer, jsonb, text) from public, anon, service_role;
grant execute on function public.console_save_settings(text, integer, jsonb, text) to authenticated;
