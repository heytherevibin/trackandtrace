-- The tap binds the key, not what the key is called.
--
-- console_remove_key digested `v_name`, and console.keys has no uniqueness on
-- (member_id, name) -- nothing stops a member holding two keys both called
-- "Backup". A tap taken for one of them recomputed to the same digest as a tap
-- taken for the other, so the confirmation a member gave for one key removed a
-- different key, proven by a branch review. The digest's `target` becomes
-- `p_key::text`: the primary key, and therefore the only field that names
-- exactly one row.
--
-- Nothing on screen changes. The four digest fields are never rendered -- an
-- earlier ruling gave the dialog its own summary/change display props for
-- exactly this reason -- and the audit row deliberately keeps the name:
-- console.write_audit's `target` is a separate argument in a separate call,
-- and a log a person reads should say "YubiKey 5 NFC", not a uuid.
--
-- Everything else about this function is unchanged and its original comments
-- are carried over verbatim (20260921100000_console_my_keys.sql).
create or replace function public.console_remove_key(p_key uuid, p_reason text, p_environment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member    console.members := console.current_member();
  v_name      text;
  v_remaining integer;
begin
  select k.name into v_name
    from console.keys k
   where k.id = p_key and k.member_id = v_member.user_id;

  if not found then
    raise exception 'no access' using errcode = '42501';
  end if;

  -- Nothing but this check holds the floor up, and a bare read of the count
  -- does not hold it against a second caller: two removals of two different
  -- keys would each read the same pre-delete count, each pass, and together
  -- leave the member below two keys and locked out of a console whose only
  -- second factor is a key. Locking the member's key rows makes the second
  -- caller wait for the first to commit or roll back, and the count below --
  -- a new statement, so a new snapshot -- then reads the settled number.
  -- `order by k.id` has both callers take the locks in the same order, so
  -- they queue instead of deadlocking.
  perform 1 from console.keys k
   where k.member_id = v_member.user_id
   order by k.id
     for update;

  select count(*) - 1 into v_remaining
    from console.keys k where k.member_id = v_member.user_id;

  if v_remaining < 2 then
    raise exception 'a member must keep at least two keys' using errcode = '42501';
  end if;

  -- The digest binds the tap to this key, this remaining count and this
  -- reason. A tap taken for a different key, or before the count changed,
  -- recomputes to a different digest and is not found. The key is named by its
  -- id, not its name: two keys may share a name, and only one can share an id.
  perform console.use_tap('Removed a key', p_key::text, v_remaining::text, p_reason);

  delete from console.keys where id = p_key and member_id = v_member.user_id;

  -- v_name, not p_key: the audit log is read by people.
  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role,
    null, null, 'session', 'Removed a key', v_name, p_reason, 'done', null,
    jsonb_build_object('keys', v_remaining + 1), jsonb_build_object('keys', v_remaining)
  );

  return v_remaining;
end;
$$;

-- `create or replace` keeps the existing grants, but they are restated here so
-- this file says on its own what may call the function it defines.
revoke all on function public.console_remove_key(uuid, text, text) from public, anon, service_role;
grant execute on function public.console_remove_key(uuid, text, text) to authenticated;
