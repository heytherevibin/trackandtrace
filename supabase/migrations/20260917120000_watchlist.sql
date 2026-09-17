-- watchlist_entries: account-scoped saved PNR records. Owner-only through RLS.
-- Forward-only. Applied locally by `supabase db reset` and remotely by `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.watchlist_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  pnr         varchar(10) not null check (pnr ~ '^[0-9]{10}$'),
  label       text not null check (char_length(label) between 1 and 200),
  checks      jsonb not null default '[]'::jsonb
              check (jsonb_typeof(checks) = 'array' and jsonb_array_length(checks) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint watchlist_entries_user_pnr_key unique (user_id, pnr)
);

create index if not exists watchlist_entries_user_created_idx
  on public.watchlist_entries (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists watchlist_entries_set_updated_at on public.watchlist_entries;
create trigger watchlist_entries_set_updated_at
  before update on public.watchlist_entries
  for each row execute function public.set_updated_at();

alter table public.watchlist_entries enable row level security;

drop policy if exists "watchlist_select_own" on public.watchlist_entries;
create policy "watchlist_select_own" on public.watchlist_entries
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "watchlist_insert_own" on public.watchlist_entries;
create policy "watchlist_insert_own" on public.watchlist_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "watchlist_update_own" on public.watchlist_entries;
create policy "watchlist_update_own" on public.watchlist_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "watchlist_delete_own" on public.watchlist_entries;
create policy "watchlist_delete_own" on public.watchlist_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.watchlist_entries from anon;
grant select, insert, update, delete on public.watchlist_entries to authenticated;
