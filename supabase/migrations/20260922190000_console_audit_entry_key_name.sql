-- The drawer's Member line needs a key NAME; console.audit_log holds only a
-- key id (task-3-addendum.md §2). Supersedes console_audit_entry as
-- 20260922140000_console_audit_read.sql left it.
--
-- The table holds no foreign keys, deliberately
-- (20260920090300_console_audit.sql): the record outlives the key and must
-- never be rewritten when one is removed. So the name is resolved at read time
-- through a LEFT join, and a key that has since been removed or reset away
-- leaves key_name null. That is the NORMAL state of an old entry, not an edge
-- case, and the drawer says so rather than pretending the action was taken
-- without a key.
--
-- The join lives on the entry and NOT on console.audit_row, which the list
-- shares: nothing in the table draws a key, so a join per row on every page
-- would be a cost with no reader. A list row therefore carries sixteen keys and
-- an entry seventeen, and console_audit_read.test.sql pins both.
--
-- CREATE OR REPLACE, not a drop: the argument list is unchanged -- (uuid) --
-- unlike 20260922140100's console_audit, which gained p_environment and so had
-- to be dropped first. Replacing in place also keeps the EXECUTE grants this
-- function already carries, which a drop would have taken with it.
create or replace function public.console_audit_entry(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('admin');
  v_out    jsonb;
begin
  -- `||` rather than a seventeenth key inside console.audit_row: jsonb_build_object
  -- keeps the key when k.name is null, so the merge is always an object and never
  -- collapses the whole entry to NULL the way `jsonb || null` would.
  select console.audit_row(a) || jsonb_build_object('key_name', k.name) into v_out
    from console.audit_log a
    left join console.keys k on k.id = a.key_id
   where a.id = p_id;

  -- SELECT INTO leaves v_out null when nothing matched, which is the answer:
  -- an entry that is not there is not an error, and a member who followed a
  -- stale link gets a sentence from the drawer rather than a refusal to
  -- translate. Deliberately NOT scoped by environment either (Ruling 1, and
  -- 20260922140100's closing note): an entry another deployment wrote opens
  -- normally and shows its own environment.
  return v_out;
end;
$$;
