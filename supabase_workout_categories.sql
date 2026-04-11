-- Run this in the Supabase SQL Editor.
-- Creates the table that holds user-customizable workout categories
-- (Push / Pull / Legs / Cardio defaults + any custom ones the user adds).

create table if not exists public.workout_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,               -- stable id used in workout_sessions.workout_type / exercises.workout_type
  label text not null,             -- display name (user-editable)
  description text,                -- optional subtitle shown on the tile
  color text not null,             -- hex like '#f97316'
  sort_order int not null default 0,
  is_cardio boolean not null default false,  -- true for the single cardio slot; its flow stays special
  is_builtin boolean not null default false, -- true for seeded defaults; used to prevent deleting the cardio row
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.workout_categories enable row level security;

create policy "own categories - select"
  on public.workout_categories for select
  using (auth.uid() = user_id);

create policy "own categories - insert"
  on public.workout_categories for insert
  with check (auth.uid() = user_id);

create policy "own categories - update"
  on public.workout_categories for update
  using (auth.uid() = user_id);

create policy "own categories - delete"
  on public.workout_categories for delete
  using (auth.uid() = user_id);

-- If workout_sessions.workout_type or exercises.workout_type is a Postgres enum
-- rather than text, custom categories won't save. Convert with:
--
--   alter table public.workout_sessions alter column workout_type type text;
--   alter table public.exercises       alter column workout_type type text;
--
-- There may also be a CHECK constraint left over from the original schema that
-- still restricts the column to push/pull/legs/cardio. Drop it with:
--
--   alter table public.exercises       drop constraint if exists exercises_workout_type_check;
--   alter table public.workout_sessions drop constraint if exists workout_sessions_workout_type_check;
