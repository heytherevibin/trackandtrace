begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('console', 'settings', 'settings exists');
select col_not_null('console', 'settings', 'version', 'a settings row always has a version');
select col_not_null('console', 'settings', 'changed_at', 'a settings row always has a changed_at');

-- The reader is service_role's alone; the saver is authenticated's alone.
-- Supabase's default privileges auto-grant EXECUTE on a new public-schema
-- function to anon, authenticated and service_role alike, so each side of
-- this must be checked, not just the side a revoke happens to name.
select is(
  has_function_privilege('service_role', 'public.console_auth_read_settings(text)', 'execute')::text,
  'true',
  'service_role can read settings'
);
select is(
  has_function_privilege('authenticated', 'public.console_auth_read_settings(text)', 'execute')::text,
  'false',
  'authenticated cannot read settings directly'
);
select is(
  has_function_privilege('anon', 'public.console_auth_read_settings(text)', 'execute')::text,
  'false',
  'anon cannot read settings directly'
);
select is(
  has_function_privilege('authenticated', 'public.console_save_settings(text, integer, jsonb, text)', 'execute')::text,
  'true',
  'authenticated can call the save path'
);
select is(
  has_function_privilege('service_role', 'public.console_save_settings(text, integer, jsonb, text)', 'execute')::text,
  'false',
  'service_role has no grant on the save path -- only a member''s own authenticated session may save'
);
select is(
  has_function_privilege('anon', 'public.console_save_settings(text, integer, jsonb, text)', 'execute')::text,
  'false',
  'anon has no grant on the save path'
);

select is((select count(*) from console.settings)::int, 3, 'one row per environment, seeded');
select is(
  (select checks_paused is null and live_checks_per_day is null from console.settings where environment = 'production'),
  true,
  'every switch starts null, meaning the deployment default'
);

-- Column-level constraints bite directly on the table, not only through the save path.
select throws_ok(
  $$update console.settings set checks_per_address = 61 where environment = 'production'$$,
  '23514',
  'new row for relation "settings" violates check constraint "settings_checks_per_address_check"',
  'checks_per_address outside its 5-60 range is refused'
);
select throws_ok(
  $$update console.settings set primary_source = 'other' where environment = 'production'$$,
  '23514',
  'new row for relation "settings" violates check constraint "settings_primary_source_check"',
  'a primary_source that is neither railkit nor rapidapi is refused'
);
select throws_ok(
  $$insert into console.settings (environment) values ('staging')$$,
  '23514',
  'new row for relation "settings" violates check constraint "settings_environment_check"',
  'an environment outside the three the table allows is refused'
);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in');
insert into console.members (user_id, email, name, role, status)
values ('11111111-1111-1111-1111-111111111111', 'owner@trakline.in', 'Owner', 'owner', 'active');
insert into console.sessions (session_id, member_id, address_hash, device_label, expires_at, key_verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'hash', 'Chrome on macOS', now() + interval '7 days', now());

create or replace function pg_temp.speak_as(p_user uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'session_id', p_session)::text, true);
end;
$$;
select pg_temp.speak_as('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- A save needs a tap for exactly these arguments.
select throws_ok(
  $$select public.console_save_settings('development', 1, '{"checks_paused": true}'::jsonb, 'maintenance')$$,
  '42501',
  'no tap for this action',
  'a save without a tap is refused'
);

-- The function's own input validation runs before it ever looks for a tap.
--
-- console_save_settings raises 22023 from three separate places -- 'nothing to save',
-- 'unknown setting %' and 'unknown environment' -- so a bare '22023', null here passed for
-- whichever of the three fired -- and all three are console_save_settings' own, five and
-- thirteen lines apart in 20260920090500_console_settings.sql, with no other 22023 anywhere
-- in the migrations to widen the net further.
-- Read off a live run rather than inferred: swapping 'nothing to save' for other words while
-- keeping its errcode fails this assertion and the null-change-set one below; swapping
-- 'unknown setting %' fails the next one alone.
--
-- Two things the naming does not buy, said plainly rather than left to look like coverage.
-- First, this assertion and the null-change-set one further down share both the guard and
-- its words -- `p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes =
-- '{}'::jsonb` is one `if`. The message cannot tell them apart; their fixtures can, and do:
-- with `or p_changes = '{}'::jsonb` deleted this one fails alone, and with `p_changes is null
-- or` deleted this one stays green while the null-change-set assertion below fails together
-- with the version check guarding it. Second, the third of the three, 'unknown environment',
-- is not reachable from here at all: it sits on the far side of console.use_tap, so no
-- assertion in this block can arrive at it. It has its own further down, with the tap that
-- getting there costs.
select throws_ok(
  $$select public.console_save_settings('development', 1, '{}'::jsonb, 'maintenance')$$,
  '22023',
  'nothing to save',
  'a save with an empty change set is refused'
);
select throws_ok(
  $$select public.console_save_settings('development', 1, '{"not_a_real_setting": true}'::jsonb, 'maintenance')$$,
  '22023',
  'unknown setting not_a_real_setting',
  'a save naming a setting that does not exist is refused'
);

-- Fix round 1: `jsonb_typeof(null) <> 'object' or null = '{}'::jsonb` is SQL
-- NULL, which plpgsql's `if` treats as false, so a literal SQL null used to
-- slip past every guard here and still bump the version, move changed_at and
-- spend the tap -- proven against 'production', never touched by the rest of
-- this file, so the version assertion below cannot be thrown off by the
-- 'development' save sequence around it. A real, matching tap is minted first
-- so this proves the exact silent-success path, not merely a missing-tap
-- refusal that would raise the unrelated 42501.
-- A tap nobody ever answered. console_save_settings is the second caller of console.use_tap, and
-- the binding that makes an unanswered tap worthless lives inside use_tap itself -- so this path
-- inherits it rather than asserting it, and nothing here would notice if that predicate were
-- removed. The equivalent assertion exists for key removal; this is its sibling, so a revert is
-- caught at both callers rather than one. `verified_at` is null and everything else matches.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-unanswered',
        console.action_digest('settings.save', 'production', '{"checks_paused": true}'::jsonb::text, 'never-tapped'),
        now() + interval '5 minutes');

select throws_ok(
  $$select public.console_save_settings('production', 1, '{"checks_paused": true}'::jsonb, 'never-tapped')$$,
  '42501',
  'no tap for this action',
  'a tap no key ever answered cannot save a setting either'
);

insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-nullchange',
        console.action_digest('settings.save', 'production', null::text, 'null-changeset-attempt'),
        now() + interval '5 minutes', now());

select throws_ok(
  $$select public.console_save_settings('production', 1, null, 'null-changeset-attempt')$$,
  '22023',
  'nothing to save',
  'a literal SQL null change set is refused, not silently accepted by a valid tap'
);
select is(
  (select version from console.settings where environment = 'production')::int,
  1,
  'the null change set attempt left the version unchanged'
);

-- The third 22023, and the only one that costs a tap to reach. 'unknown environment' sits
-- after console.use_tap, not before it like the two above, so a change set and a reason are
-- not enough on their own -- without a real tap the call raises 42501 'no tap for this action'
-- and never reaches the settings lookup at all. So this mints one, for exactly these
-- arguments, and the environment is part of what use_tap digests.
--
-- 'staging' is the same name the table-level assertion near the top of this file refuses:
-- outside the closed set console.settings will hold, so no row can match it and none has to be
-- deleted to make that true -- the seeded count of 3 asserted above stays 3. The two together
-- say the whole rule: the table will not store that environment, and the save path will not
-- write to it either.
--
-- The refused call does not spend the tap. The raise aborts the whole statement, so use_tap's
-- `used_at` update rolls back with it and the challenge row is left untouched for anything
-- after this -- which is why no assertion below has to work around it.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-unknownenv',
        console.action_digest('settings.save', 'staging', ('{"checks_paused": true}'::jsonb)::text, 'saving to nowhere'),
        now() + interval '5 minutes', now());

select throws_ok(
  $$select public.console_save_settings('staging', 1, '{"checks_paused": true}'::jsonb, 'saving to nowhere')$$,
  '22023',
  'unknown environment',
  'a save aimed at an environment the table does not hold is refused'
);

-- The tap's value is the change set as jsonb renders it, which is what the
-- function hashes (`p_changes::text`). Cast in the test too, so the two agree
-- whatever jsonb does with spacing.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-0001',
        console.action_digest('settings.save', 'development', ('{"checks_paused": true}'::jsonb)::text, 'maintenance'),
        now() + interval '5 minutes', now());

select is(
  public.console_save_settings('development', 1, '{"checks_paused": true}'::jsonb, 'maintenance'),
  2,
  'a save bumps the version'
);
select is(
  (select checks_paused from console.settings where environment = 'development'),
  true,
  'the switch is applied'
);
select is(
  (select count(*)::int from console.audit_log where category = 'settings' and target = 'checks_paused'),
  1,
  'one audit row per changed field'
);
select is(
  (select before from console.audit_log where category = 'settings' and target = 'checks_paused'),
  '{"checks_paused": null}'::jsonb,
  'the audit row records what the field was before'
);
select is(
  (select after from console.audit_log where category = 'settings' and target = 'checks_paused'),
  '{"checks_paused": true}'::jsonb,
  'the audit row records what the field became'
);

-- Two saves cannot clash: the second one carries a stale version.
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-0002',
        console.action_digest('settings.save', 'development', ('{"checks_paused": false}'::jsonb)::text, 'undo'),
        now() + interval '5 minutes', now());

select throws_ok(
  $$select public.console_save_settings('development', 1, '{"checks_paused": false}'::jsonb, 'undo')$$,
  '40001',
  'stale version',
  'a stale version is refused'
);

-- A member below admin cannot save, even holding a valid tap -- the role gate
-- must run before the tap is spent, not after.
update console.members set role = 'viewer' where user_id = '11111111-1111-1111-1111-111111111111';
insert into console.challenges (member_id, session_id, purpose, challenge, digest, expires_at, verified_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'action', 'settings-challenge-0003',
        console.action_digest('settings.save', 'development', ('{"checks_paused": false}'::jsonb)::text, 'viewer-attempt'),
        now() + interval '5 minutes', now());

select throws_ok(
  $$select public.console_save_settings('development', 2, '{"checks_paused": false}'::jsonb, 'viewer-attempt')$$,
  '42501',
  'no access',
  'a member below admin is refused even with a valid tap'
);
select is(
  (select used_at is null from console.challenges where challenge = 'settings-challenge-0003'),
  true,
  'the refused save leaves the tap unspent'
);
update console.members set role = 'owner' where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  public.console_auth_read_settings('development') ->> 'checks_paused',
  'true',
  'the reader hands the traveller path the current value'
);

select * from finish();
rollback;
