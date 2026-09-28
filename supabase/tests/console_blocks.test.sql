begin;
create extension if not exists pgtap with schema extensions;

-- Module 04's two writers. The block itself lives in Upstash (the owner's call, 2026-09-28); what
-- lives here is the approval and the record: each call spends a tap minted for exactly these
-- arguments and writes one audit row, in one transaction, or does neither.
--
-- The digest covers the ENVIRONMENT, inside p_value, for the reason
-- 20260923090000_console_audit_environment_closed.sql spells out: a tap minted for this deployment
-- must not be spendable to file the record under another.

select plan(20);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in');
insert into console.members (user_id, email, name, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'support@trakline.in', 'Support', 'support', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now()),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;

-- A verified tap for exactly these four fields.
create or replace function pg_temp.tap(p_member uuid, p_session uuid, p_label text, p_action text, p_target text, p_value text, p_reason text) returns void
language plpgsql as $$
begin
  insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
  values (p_member, p_session, 'action', p_label, console.action_digest(p_action, p_target, p_value, p_reason), now() + interval '5 minutes', now());
end;
$$;

-- 43 characters: base64url of a SHA-256, which is what the server's keyed hash gives.
select set_config('t.hash', '4.' || repeat('a', 43), true);
select set_config('t.value', '{"environment":"development","duration":"24h","note":"Scripted checks"}', true);

select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- Grants: a member's own session calls these; nothing else does.
select is(has_function_privilege('authenticated', 'public.console_block_address(text, text, text, text)', 'execute')::text, 'true', 'authenticated can block');
select is(has_function_privilege('anon', 'public.console_block_address(text, text, text, text)', 'execute')::text, 'false', 'anon cannot block');
select is(has_function_privilege('service_role', 'public.console_block_address(text, text, text, text)', 'execute')::text, 'false', 'service_role cannot block: a block is a person''s act');
select is(has_function_privilege('authenticated', 'public.console_unblock_address(text, text, text, text)', 'execute')::text, 'true', 'authenticated can unblock');
select is(has_function_privilege('anon', 'public.console_unblock_address(text, text, text, text)', 'execute')::text, 'false', 'anon cannot unblock');

-- No tap, no block.
select throws_ok(
  format($$select public.console_block_address('development', %L, %L, 'Scripted checks from one address')$$, current_setting('t.hash'), current_setting('t.value')),
  '42501', 'no tap for this action', 'a block without a tap is refused'
);

-- Input is checked before a tap is looked for, so a malformed call costs no ceremony.
select throws_ok(
  $$select public.console_block_address('development', '203.0.113.9', '{"environment":"development","duration":"24h","note":""}', 'a raw address is not a hash')$$,
  '22023', 'not an address hash', 'a raw address is refused: only a hash is ever stored'
);
select throws_ok(
  format($$select public.console_block_address('development', %L, '{"environment":"development","duration":"forever","note":""}', 'a duration nobody offers')$$, current_setting('t.hash')),
  '22023', 'unknown duration', 'a duration outside the four the dialog offers is refused'
);
select throws_ok(
  format($$select public.console_block_address('development', %L, '{"environment":"production","duration":"24h","note":""}', 'filed under another deployment')$$, current_setting('t.hash')),
  '22023', 'environment mismatch', 'the value must name the environment the call writes under'
);
select throws_ok(
  format($$select public.console_block_address('development', %L, %L, 'a note far too long')$$, current_setting('t.hash'), '{"environment":"development","duration":"24h","note":"' || repeat('x', 201) || '"}'),
  '22023', 'note too long', 'a note past 200 characters is refused'
);

-- A tap minted for production cannot be spent under development.
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'blocks-challenge-0001',
  'Blocked an address', current_setting('t.hash'), '{"environment":"production","duration":"24h","note":"Scripted checks"}', 'Scripted checks from one address');
select throws_ok(
  format($$select public.console_block_address('development', %L, %L, 'Scripted checks from one address')$$, current_setting('t.hash'), current_setting('t.value')),
  '42501', 'no tap for this action', 'a tap minted for another deployment does not approve this one'
);

-- The approved path: one tap, one row.
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'blocks-challenge-0002',
  'Blocked an address', current_setting('t.hash'), current_setting('t.value'), 'Scripted checks from one address');
select lives_ok(
  format($$select public.console_block_address('development', %L, %L, 'Scripted checks from one address')$$, current_setting('t.hash'), current_setting('t.value')),
  'a block with its tap goes through'
);
select is(
  (select count(*)::int from console.audit_log where action = 'Blocked an address' and target = current_setting('t.hash') and environment = 'development' and result = 'done'),
  1, 'it writes one Done row, under the hash'
);
select is(
  (select after from console.audit_log where action = 'Blocked an address' and target = current_setting('t.hash')),
  '{"duration": "24h", "note": "Scripted checks"}'::jsonb, 'the row carries the duration and the note'
);
select is(
  (select category from console.audit_log where action = 'Blocked an address' and target = current_setting('t.hash')),
  'configure', 'filed under Configure'
);

-- The same tap cannot approve a second block.
select throws_ok(
  format($$select public.console_block_address('development', %L, %L, 'Scripted checks from one address')$$, current_setting('t.hash'), current_setting('t.value')),
  '42501', 'no tap for this action', 'a spent tap is spent'
);

-- Unblock: its own action name, so a block's tap cannot lift one.
select pg_temp.tap('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'blocks-challenge-0003',
  'Unblocked an address', current_setting('t.hash'), '{"environment":"development"}', 'Blocked by mistake, lifting it');
select lives_ok(
  format($$select public.console_unblock_address('development', %L, '{"environment":"development"}', 'Blocked by mistake, lifting it')$$, current_setting('t.hash')),
  'an unblock with its tap goes through'
);
select is(
  (select count(*)::int from console.audit_log where action = 'Unblocked an address' and target = current_setting('t.hash') and result = 'done'),
  1, 'it writes one Done row'
);

-- Below Admin, refused before any tap is looked at.
select pg_temp.speak_as('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select pg_temp.tap('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'blocks-challenge-0004',
  'Blocked an address', current_setting('t.hash'), current_setting('t.value'), 'Support trying to block');
select throws_ok(
  format($$select public.console_block_address('development', %L, %L, 'Support trying to block')$$, current_setting('t.hash'), current_setting('t.value')),
  '42501', null, 'Support cannot block, even holding a tap'
);
select is(
  (select used_at is null from console.challenges where challenge = 'blocks-challenge-0004'),
  true, 'and the refusal leaves that tap unspent'
);

select * from finish();
rollback;
