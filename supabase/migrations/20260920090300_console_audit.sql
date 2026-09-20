-- The audit log. Append-only: updates and deletes are refused, and only
-- console.purge_audit() removes rows, only when they are older than two years.

create type console.audit_result as enum ('done', 'refused', 'failed');

create table console.audit_log (
  id             uuid primary key default gen_random_uuid(),
  at             timestamptz not null default now(),
  environment    text not null check (char_length(environment) between 1 and 20),
  -- The log names the actor and key as they were; it holds no foreign key,
  -- because the record outlives both and must never be rewritten when they go.
  actor_id       uuid,
  actor_name     text not null check (char_length(actor_name) between 1 and 120),
  actor_role     console.member_role,
  key_id         uuid,
  session_label  text,
  category       text not null check (char_length(category) between 1 and 40),
  action         text not null check (char_length(action) between 1 and 120),
  target         text,
  reason         text,
  result         console.audit_result not null,
  address_hash   text,
  before         jsonb,
  after          jsonb
);

create index console_audit_at_idx on console.audit_log (at desc);
create index console_audit_category_idx on console.audit_log (category, at desc);
create index console_audit_actor_idx on console.audit_log (actor_id, at desc);

revoke all on console.audit_log from anon, authenticated;
-- Append-only means append-only for every role, including the one the server
-- holds. ALL, not just UPDATE/DELETE: this line must stand on its own and also
-- cover TRUNCATE, not rely on Task 1 having already revoked schema USAGE.
revoke all on console.audit_log from service_role, authenticator;

-- Reasons are free text. The server scrubs them; SQL scrubs them again, because
-- the audit log is the one place a slip would be permanent.
-- Order matters: email must be taken first. An address whose local part is
-- itself a long run of digits (e.g. 2345678901@example.com) would otherwise
-- have that run swallowed by the digit pass first, leaving a mangled
-- "[removed]@example.com" that no longer matches the email pattern at all --
-- the domain, and the fact that an address was ever there, would survive.
create or replace function console.scrub(p_text text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p_text, ''), '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}', '[removed]', 'g'),
             '[0-9]{10,}', '[removed]', 'g'),
           '([0-9]{1,3}[.]){3}[0-9]{1,3}|([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}', '[removed]', 'g');
$$;

-- No update ever has a legitimate reason: not a correction, not a cascade.
create or replace function console.audit_refuse_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'the audit log is append-only' using errcode = '42501';
end;
$$;

create trigger console_audit_refuse_update
  before update on console.audit_log
  for each statement execute function console.audit_refuse_update();

-- The age rule lives here, not just in purge_audit()'s WHERE clause: a row is
-- only ever removed when the purging flag is set AND that specific row has
-- passed the two-year mark. Row-level, so it re-checks every row a DELETE
-- touches, regardless of who issued the statement or how its WHERE clause
-- was written.
create or replace function console.audit_only_purge_old()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('console.purging', true) = 'on' and old.at < now() - interval '2 years' then
    return old;
  end if;
  raise exception 'the audit log is append-only' using errcode = '42501';
end;
$$;

create trigger console_audit_only_purge_old
  before delete on console.audit_log
  for each row execute function console.audit_only_purge_old();

create or replace function console.write_audit(
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into console.audit_log (
    environment, actor_id, actor_name, actor_role, key_id, session_label,
    category, action, target, reason, result, address_hash, before, after
  ) values (
    p_environment, p_actor, coalesce(p_actor_name, 'System'), p_actor_role, p_key_id, p_session_label,
    p_category, p_action, p_target, nullif(console.scrub(p_reason), ''), p_result, p_address_hash, p_before, p_after
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function console.write_audit(text, uuid, text, console.member_role, uuid, text, text, text, text, text, console.audit_result, text, jsonb, jsonb) from public, anon, authenticated;

-- Written now, scheduled when cron arrives (Phase 3).
create or replace function console.purge_audit()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  perform set_config('console.purging', 'on', true);
  delete from console.audit_log where at < now() - interval '2 years';
  get diagnostics v_removed = row_count;
  perform set_config('console.purging', 'off', true);
  return v_removed;
end;
$$;

revoke all on function console.purge_audit() from public, anon, authenticated;
