-- Review Signal — Supabase schema
-- Run this in your Supabase project's SQL Editor (safe to re-run).

-- ============ tables ============
create table if not exists public.datasets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  engine      text,
  source_type text not null default 'csv',           -- 'csv' | 'sheet'
  source_meta jsonb not null default '{}'::jsonb,     -- spreadsheetId, sheetName, classStartColIndex, textColumn, writeBack, url
  created_at  timestamptz not null default now()
);

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  row_number  int,
  author      text,
  date        text,
  text        text not null,
  sentiment   text,
  likeliness  int,
  category    text,
  nps         int,
  edited      boolean not null default false
);

create index if not exists datasets_user_idx on public.datasets(user_id);
create index if not exists reviews_dataset_idx on public.reviews(dataset_id);

-- ============ row level security ============
alter table public.datasets enable row level security;
alter table public.reviews  enable row level security;

-- datasets: owner-only
drop policy if exists datasets_select_own on public.datasets;
drop policy if exists datasets_insert_own on public.datasets;
drop policy if exists datasets_update_own on public.datasets;
drop policy if exists datasets_delete_own on public.datasets;
create policy datasets_select_own on public.datasets for select using (auth.uid() = user_id);
create policy datasets_insert_own on public.datasets for insert with check (auth.uid() = user_id);
create policy datasets_update_own on public.datasets for update using (auth.uid() = user_id);
create policy datasets_delete_own on public.datasets for delete using (auth.uid() = user_id);

-- reviews: owner-only
drop policy if exists reviews_select_own on public.reviews;
drop policy if exists reviews_insert_own on public.reviews;
drop policy if exists reviews_update_own on public.reviews;
drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_select_own on public.reviews for select using (auth.uid() = user_id);
create policy reviews_insert_own on public.reviews for insert with check (auth.uid() = user_id);
create policy reviews_update_own on public.reviews for update using (auth.uid() = user_id);
create policy reviews_delete_own on public.reviews for delete using (auth.uid() = user_id);
