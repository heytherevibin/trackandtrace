begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Reachable only through the functions, and the functions only by the server.
select is(has_schema_privilege('anon', 'subscriptions', 'usage')::text, 'false', 'anon cannot reach the schema');
select is(has_schema_privilege('authenticated', 'subscriptions', 'usage')::text, 'false', 'authenticated cannot reach the schema');
select is(has_function_privilege('anon', 'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)', 'execute')::text, 'false', 'anon cannot sign anyone up');
select is(has_function_privilege('authenticated', 'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)', 'execute')::text, 'false', 'authenticated cannot either');
select is(has_function_privilege('service_role', 'public.subscriptions_sign_up(text, text, text, jsonb, text, bytea)', 'execute')::text, 'true', 'the server can');

-- A first sign-up is due an email, and leaves a pending consent.
select is(public.subscriptions_sign_up('Asha@Example.in ', 'news', 'footer', null, '1.1', decode(repeat('a1', 32), 'hex')), 'send', 'a new address is due one email');
select is((select email from subscriptions.people), 'asha@example.in', 'stored lowercased and trimmed');
select ok((select confirmed_at is null from subscriptions.consents), 'pending until confirmed');

-- The resend guard: inside ten minutes, no second email.
select is(public.subscriptions_sign_up('asha@example.in', 'news', 'footer', null, '1.1', decode(repeat('b2', 32), 'hex')), 'quiet', 'no second email within ten minutes');

-- Peek changes nothing; confirm spends the token.
select is(public.subscriptions_peek(decode(repeat('a1', 32), 'hex')) ->> 'state', 'confirmed', 'peek reports what confirm would do');
select ok((select confirmed_at is null from subscriptions.consents), 'peek changed nothing');
select is(public.subscriptions_confirm(decode(repeat('a1', 32), 'hex')), '{"list": "news", "state": "confirmed"}'::jsonb, 'confirm confirms, and says which list');
select is(public.subscriptions_confirm(decode(repeat('a1', 32), 'hex')) ->> 'state', 'already', 'a spent token is already done');
select is(public.subscriptions_confirm(decode(repeat('ff', 32), 'hex')) ->> 'state', 'invalid', 'an unknown token is invalid');

-- A subscribed address signing up again gets the same quiet answer and no email.
select is(public.subscriptions_sign_up('asha@example.in', 'news', 'footer', null, '1.1', decode(repeat('c3', 32), 'hex')), 'quiet', 'already subscribed: no email');

-- Expiry.
insert into subscriptions.people (email, first_source) values ('late@example.in', 'footer');
insert into subscriptions.consents (person_id, list, notice_version, source) select id, 'news', '1.1', 'footer' from subscriptions.people where email = 'late@example.in';
insert into subscriptions.confirm_tokens (token_hash, person_id, list, expires_at) select decode(repeat('d4', 32), 'hex'), id, 'news', now() - interval '1 minute' from subscriptions.people where email = 'late@example.in';
select is(public.subscriptions_confirm(decode(repeat('d4', 32), 'hex')) ->> 'state', 'expired', 'a token past 48 hours is expired');

-- Withdraw and rejoin.
select is(public.subscriptions_withdraw((select id from subscriptions.people where email = 'asha@example.in'), 'news', 'too many'), 'done', 'withdraw');
select is((select withdraw_reason from subscriptions.consents c join subscriptions.people p on p.id = c.person_id where p.email = 'asha@example.in'), 'too many', 'with its reason');
select is(public.subscriptions_rejoin((select id from subscriptions.people where email = 'asha@example.in'), 'news'), 'done', 'rejoin');
select is(public.subscriptions_withdraw(gen_random_uuid(), 'news', null), 'unknown', 'an unknown person is unknown');

-- The purge: never-confirmed people older than seven days go on the next sign-up; confirmed ones stay.
update subscriptions.people set first_seen = now() - interval '8 days';
select is(public.subscriptions_sign_up('new@example.in', 'availability', 'pre-booking', null, '1.1', decode(repeat('e5', 32), 'hex')), 'send', 'another sign-up');
select is((select array_agg(email order by email) from subscriptions.people)::text, '{asha@example.in,new@example.in}', 'the unconfirmed eight-day-old address was purged; the confirmed one stays');

select * from finish();
rollback;
