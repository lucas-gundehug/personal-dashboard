-- Tables for the workout plan and its weekly history (src/lib/workout-store.ts;
-- the companion housekeeping app reads and edits the same tables).
-- Run once in a new Supabase project: SQL Editor → paste → Run.
--
-- The app talks to these tables server-side with the service-role key
-- (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), so row level security is on
-- with no policies: the public anon key can't read or write anything.
-- Without these env vars the app keeps the plan in memory instead.
--
-- A new database starts with an empty plan: add your sessions and exercises on
-- the /workout-edit page. (The built-in example plan in src/lib/workout-store.ts
-- is only used when no database is connected.)

create table if not exists public.workout_plan_sessions (
  id text primary key,
  kind text not null check (kind in ('run', 'strength')),
  label text not null,
  position integer not null default 0
);

create table if not exists public.workout_plan_exercises (
  id text primary key,
  session_id text not null references public.workout_plan_sessions (id) on delete cascade,
  label text not null,
  detail_template text not null default '',
  position integer not null default 0
);

-- `week` is an ISO week key, e.g. "2026-W43". Session check-offs keep no
-- foreign key; an exercise's ratings and progression are deleted together with
-- the exercise (see savePlan in src/lib/workout-store.ts).
create table if not exists public.workout_sessions (
  week text not null,
  session_id text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (week, session_id)
);

create table if not exists public.exercise_ratings (
  week text not null,
  exercise_id text not null references public.workout_plan_exercises (id) on delete cascade,
  difficulty text not null check (difficulty in ('easy', 'ok', 'hard')),
  rated_at timestamptz not null default now(),
  primary key (week, exercise_id)
);

create table if not exists public.exercise_progression (
  exercise_id text primary key references public.workout_plan_exercises (id) on delete cascade,
  step integer not null default 0,
  last_week_applied text,
  updated_at timestamptz not null default now()
);

alter table public.workout_plan_sessions enable row level security;
alter table public.workout_plan_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.exercise_ratings enable row level security;
alter table public.exercise_progression enable row level security;

-- Newer Supabase projects don't always grant the API roles access to tables
-- created in SQL, so grant the server-side role explicitly.
grant select, insert, update, delete on
  public.workout_plan_sessions,
  public.workout_plan_exercises,
  public.workout_sessions,
  public.exercise_ratings,
  public.exercise_progression
to service_role;
