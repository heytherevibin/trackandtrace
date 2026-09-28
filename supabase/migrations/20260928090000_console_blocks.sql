-- Module 04's two writers: block an address, and lift a block.
--
-- The block itself lives in Upstash, beside the rate limiter that enforces it (the owner's call,
-- 2026-09-28): every traveller check consults it, and a database read on that path is the cost that
-- decision avoided. What lives HERE is the approval and the record. Each function spends a tap
-- minted for exactly its four arguments and writes one audit row, in one transaction -- or raises,
-- and does neither. The route writes Upstash only after this returns.
--
-- No table: nothing about a block is stored in Postgres but its audit row.
--
-- p_target is the address HASH (a kind, a dot, 43 base64url characters), never an address. The
-- console hashes on entry and nothing here can un-hash; a raw address is refused outright so a
-- mistake upstream cannot put one in the audit log.
--
-- p_value is canonical JSON carrying the ENVIRONMENT, and it is digested: a tap minted for this
-- deployment cannot be spent to file the record under another. See
-- 20260923090000_console_audit_environment_closed.sql for why that matters.

create or replace function public.console_block_address(
  p_environment text,
  p_target      text,
  p_value       text,
  p_reason      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- First, so a role below Admin is refused before a tap is looked at -- and its tap stays unspent.
  v_member console.members := console.require_role('admin');
  v_value  jsonb;
begin
  if p_target is null or p_target !~ '^[46?]\.[A-Za-z0-9_-]{43}$' then
    raise exception 'not an address hash' using errcode = '22023';
  end if;

  begin
    v_value := p_value::jsonb;
  exception when invalid_text_representation then
    raise exception 'unreadable value' using errcode = '22023';
  end;
  if jsonb_typeof(v_value) <> 'object' then
    raise exception 'unreadable value' using errcode = '22023';
  end if;
  if v_value ->> 'environment' is distinct from p_environment then
    raise exception 'environment mismatch' using errcode = '22023';
  end if;
  if (v_value ->> 'duration') is null or (v_value ->> 'duration') not in ('1h', '24h', '7d', 'removed') then
    raise exception 'unknown duration' using errcode = '22023';
  end if;
  if length(coalesce(v_value ->> 'note', '')) > 200 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  perform console.use_tap('Blocked an address', p_target, p_value, p_reason);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'configure', 'Blocked an address', p_target, p_reason, 'done', null,
    null, jsonb_build_object('duration', v_value ->> 'duration', 'note', coalesce(v_value ->> 'note', ''))
  );
end;
$$;

create or replace function public.console_unblock_address(
  p_environment text,
  p_target      text,
  p_value       text,
  p_reason      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member console.members := console.require_role('admin');
  v_value  jsonb;
begin
  if p_target is null or p_target !~ '^[46?]\.[A-Za-z0-9_-]{43}$' then
    raise exception 'not an address hash' using errcode = '22023';
  end if;

  begin
    v_value := p_value::jsonb;
  exception when invalid_text_representation then
    raise exception 'unreadable value' using errcode = '22023';
  end;
  if jsonb_typeof(v_value) <> 'object' or v_value ->> 'environment' is distinct from p_environment then
    raise exception 'environment mismatch' using errcode = '22023';
  end if;

  perform console.use_tap('Unblocked an address', p_target, p_value, p_reason);

  perform console.write_audit(
    p_environment, v_member.user_id, v_member.name, v_member.role, null, null,
    'configure', 'Unblocked an address', p_target, p_reason, 'done', null,
    null, null
  );
end;
$$;

-- Supabase's default privileges auto-grant EXECUTE on a new public-schema function to anon,
-- authenticated and service_role alike. Only a member's own session may block: service_role is
-- revoked too, because a block is a person's act and must carry that person's tap.
revoke all on function public.console_block_address(text, text, text, text) from public, anon, service_role;
grant execute on function public.console_block_address(text, text, text, text) to authenticated;
revoke all on function public.console_unblock_address(text, text, text, text) from public, anon, service_role;
grant execute on function public.console_unblock_address(text, text, text, text) to authenticated;
