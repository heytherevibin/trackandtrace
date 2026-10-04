-- Deleting a draft (07). The eighth of the console's functions over letters, and the one the sheet
-- did not draw: the owner asked for it on 2026-10-04, after the first test draft could not be
-- removed.
--
-- ONLY A DRAFT. A draft has gone to nobody, so deleting it loses nothing. Anything that has been
-- queued is refused, whatever its state now: a queued or sending letter is about to reach people,
-- and a stopped or finished one is the record of who received what. `announcements.deliveries`
-- cascades from `letters`, so a delete of one of those would take that record with it — which is why
-- the state is checked here, in the database, and not only by the console that draws the button.
--
-- Like its seven siblings (20261004090000_console_letters.sql): the Admin floor first, the member
-- from the session, and the audit row in the same transaction as the change.
create or replace function public.console_delete_letter(p_environment text, p_letter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member console.members := console.require_role('admin');
  v_letter announcements.letters;
begin
  select * into v_letter from announcements.letters l where l.id = p_letter for update;
  if not found then
    raise exception 'no such letter' using errcode = '22023';
  end if;
  if v_letter.state <> 'draft' then
    raise exception 'not a draft' using errcode = '22023';
  end if;
  delete from announcements.letters where id = p_letter;
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'messages', 'Deleted a draft', v_letter.subject, null, 'done', null,
    null, jsonb_build_object('list', v_letter.list));
end $$;

revoke all on function public.console_delete_letter(text, uuid) from public, anon, service_role;
grant execute on function public.console_delete_letter(text, uuid) to authenticated;
