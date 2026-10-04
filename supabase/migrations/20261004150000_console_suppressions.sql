-- The console's Suppressions view (07, PR 3b). Three functions over `announcements.suppressions`,
-- each for a console member's OWN session, with the Admin floor first and the audit row in the same
-- transaction as the act — the shape of 20261004090000_console_letters.sql.
--
-- A ROW IS NAMED BY AN ID, NEVER BY ITS ADDRESS. The table's key is the address itself, and a page
-- that named rows by it would carry every address to the browser, masked on the screen and whole in
-- the markup. So each row gets an id of its own, and the address leaves the database only through
-- `console_reveal_suppression`, which records that it did.
alter table announcements.suppressions add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists suppressions_id_key on announcements.suppressions (id);

-- The first letter and the domain: enough to tell two rows apart and to recognise one you already
-- know, and not enough to write to. The middle is always three dots, so its length says nothing.
create or replace function announcements.masked(p_email text) returns text
language sql immutable set search_path = '' as $$
  select left(p_email, 1) || '•••' || substr(p_email, position('@' in p_email));
$$;
revoke all on function announcements.masked(text) from public, anon, authenticated;

-- Every suppression, newest first. An address is masked UNLESS it is a console member's: the sheet
-- names operator addresses outright, because a hard-bounced operator address silently stops that
-- member's sign-in mail and that must be visible rather than inferred. A removed member is not an
-- operator. No masked row carries its address anywhere in the answer.
create or replace function public.console_suppressions() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform console.require_role('admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id,
             'address', case when o.operator then s.email else announcements.masked(s.email) end,
             'masked', not o.operator,
             'operator', o.operator,
             'scope', s.scope, 'reason', s.reason, 'at', s.at)
           order by s.at desc)
      from announcements.suppressions s
     cross join lateral (
       select exists (select 1 from console.members m where m.email = s.email and m.status <> 'removed') as operator) o
  ), '[]'::jsonb);
end $$;

-- The address, whole — and a row in the audit log saying who asked. The log names the row by its
-- MASKED address: an audit log that held every revealed address would be a second copy of what the
-- mask guards, readable by anyone who can read the log.
create or replace function public.console_reveal_suppression(p_environment text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('admin');
  v_row    announcements.suppressions;
begin
  select * into v_row from announcements.suppressions s where s.id = p_id;
  if not found then
    raise exception 'no such suppression' using errcode = '22023';
  end if;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Revealed a suppressed address', announcements.masked(v_row.email), null, 'done', null,
    null, jsonb_build_object('scope', v_row.scope, 'reason', v_row.reason));
  return v_row.email;
end $$;

-- Lift. The caller must NAME THE ADDRESS, and it must be the row's: nobody restarts mail to an
-- address they have not seen. That is the sheet's rule ("Lift needs the address revealed first"),
-- held here rather than only by a greyed-out button — a caller who has the id alone, from the list,
-- cannot lift. The comparison is on the stored form, trimmed and lower case.
create or replace function public.console_lift_suppression(p_environment text, p_id uuid, p_address text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('admin');
  v_row    announcements.suppressions;
begin
  select * into v_row from announcements.suppressions s where s.id = p_id for update;
  if not found then
    raise exception 'no such suppression' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_address, ''))) is distinct from v_row.email then
    raise exception 'address mismatch' using errcode = '22023';
  end if;
  delete from announcements.suppressions where id = p_id;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Lifted a suppression', announcements.masked(v_row.email), null, 'done', null,
    null, jsonb_build_object('scope', v_row.scope, 'reason', v_row.reason));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.console_suppressions()',
    'public.console_reveal_suppression(text, uuid)',
    'public.console_lift_suppression(text, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
