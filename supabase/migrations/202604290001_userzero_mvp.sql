create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  github_username text,
  display_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verified_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hostname text not null,
  token_hash text not null,
  verification_method text check (verification_method in ('meta', 'txt')),
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, hostname)
);

create table if not exists public.qa_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_url text not null,
  target_hostname text not null,
  persona text not null,
  goal text not null,
  max_steps integer not null default 20,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'blocked', 'failed')),
  result text check (result in ('completed', 'partially_completed', 'blocked')),
  error text,
  issue_count integer not null default 0,
  report_md text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.qa_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_number integer not null,
  url text not null,
  screenshot_path text,
  observation text not null,
  progress text not null,
  action jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, step_number)
);

create table if not exists public.qa_issues (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_number integer,
  category text not null check (category in ('bug', 'ux', 'accessibility', 'copy', 'navigation')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  title text not null,
  description text not null,
  evidence text not null,
  suggested_fix text not null,
  screenshot_path text,
  created_at timestamptz not null default now()
);

create index if not exists verified_domains_user_id_idx on public.verified_domains(user_id);
create index if not exists qa_runs_user_id_created_at_idx on public.qa_runs(user_id, created_at desc);
create index if not exists qa_steps_run_id_step_number_idx on public.qa_steps(run_id, step_number);
create index if not exists qa_issues_run_id_created_at_idx on public.qa_issues(run_id, created_at);

alter table public.profiles enable row level security;
alter table public.verified_domains enable row level security;
alter table public.qa_runs enable row level security;
alter table public.qa_steps enable row level security;
alter table public.qa_issues enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "domains_all_own" on public.verified_domains for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runs_all_own" on public.qa_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "steps_all_own" on public.qa_steps for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "issues_all_own" on public.qa_issues for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('qa-screenshots', 'qa-screenshots', false)
on conflict (id) do nothing;
