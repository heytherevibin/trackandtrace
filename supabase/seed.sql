-- Local development seed only. `supabase db push` never runs this file.
-- Creates one dev user and two sample watchlist rows keyed to fixture PNRs.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'dev@trackandtrace.local',
  crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Dev User"}', now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  '{"sub":"00000000-0000-4000-8000-000000000001","email":"dev@trackandtrace.local"}', 'email', now(), now(), now()
) on conflict do nothing;

insert into public.watchlist_entries (user_id, pnr, label, checks) values
  ('00000000-0000-4000-8000-000000000001', '2345678901', '12951 · BCT→NDLS · sample',
   '[{"at":"2026-09-16T04:30:00.000Z","status":"CNF","position":null}]'),
  ('00000000-0000-4000-8000-000000000001', '2345678905', '12621 · MAS→NDLS · sample',
   '[{"at":"2026-09-16T04:30:00.000Z","status":"WL","position":14}]')
on conflict (user_id, pnr) do nothing;
