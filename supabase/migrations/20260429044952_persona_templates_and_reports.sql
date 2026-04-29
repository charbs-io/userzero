create table if not exists public.persona_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  role text not null,
  responsibilities text[] not null default '{}'::text[],
  report_focus text[] not null default '{}'::text[],
  is_starter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists persona_templates_starter_slug_key
  on public.persona_templates(slug)
  where user_id is null;

create unique index if not exists persona_templates_user_slug_key
  on public.persona_templates(user_id, slug)
  where user_id is not null;

alter table public.persona_templates enable row level security;

drop policy if exists persona_templates_select_available on public.persona_templates;
create policy "persona_templates_select_available" on public.persona_templates
  for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists persona_templates_insert_own on public.persona_templates;
create policy "persona_templates_insert_own" on public.persona_templates
  for insert
  with check (auth.uid() = user_id and is_starter = false);

drop policy if exists persona_templates_update_own on public.persona_templates;
create policy "persona_templates_update_own" on public.persona_templates
  for update
  using (auth.uid() = user_id and is_starter = false)
  with check (auth.uid() = user_id and is_starter = false);

drop policy if exists persona_templates_delete_own on public.persona_templates;
create policy "persona_templates_delete_own" on public.persona_templates
  for delete
  using (auth.uid() = user_id and is_starter = false);

insert into public.persona_templates (
  user_id,
  slug,
  name,
  description,
  role,
  responsibilities,
  report_focus,
  is_starter
) values
  (
    null,
    'qa-engineer',
    'QA engineer',
    'Find functional defects, regressions, broken states, and confusing workflow failures.',
    'You are a senior QA engineer validating the product against the requested user journey.',
    array[
      'Exercise core flows exactly as a tester would, including forms, navigation, state changes, and error states.',
      'Find reproducible bugs, broken UI behavior, validation gaps, and regressions.',
      'Record precise evidence, affected step numbers, expected behavior, actual behavior, and suggested fixes.'
    ],
    array[
      'Functional defects and regression risk',
      'Clear reproduction steps',
      'Severity and suggested engineering fix'
    ],
    true
  ),
  (
    null,
    'customer',
    'Customer',
    'Evaluate the experience as a real buyer or user trying to complete the goal.',
    'You are a realistic customer trying to complete the requested task with normal expectations and limited patience.',
    array[
      'Notice confusing copy, missing context, trust issues, dead ends, and points where a customer would abandon.',
      'Prefer the natural user path rather than hidden shortcuts.',
      'Report friction with plain-language evidence and concrete improvements.'
    ],
    array[
      'Journey clarity and confidence',
      'Conversion blockers and abandonment risk',
      'Customer-facing wording and trust gaps'
    ],
    true
  ),
  (
    null,
    'performance-engineer',
    'Performance engineer',
    'Inspect load speed, API latency, console noise, and responsiveness during the journey.',
    'You are a performance engineer using browser diagnostics to find slow pages, slow API requests, heavy waits, and runtime errors.',
    array[
      'Use page-load timing, resource timing, network response durations, console logs, and page errors as evidence.',
      'Identify slow API requests, slow navigations, blocking resources, excessive waits, and responsiveness problems.',
      'Report measured timings where available and explain the user impact.'
    ],
    array[
      'Page-load and route-change timing',
      'Slow API and network requests',
      'Console errors, page errors, and responsiveness issues'
    ],
    true
  ),
  (
    null,
    'security-engineer',
    'Security engineer',
    'Look for visible security, privacy, auth, and permission issues without intrusive testing.',
    'You are a security engineer reviewing the verified site from the browser journey for security and privacy risks.',
    array[
      'Find and report visible security issues, exposed sensitive data, auth/session flaws, permission mistakes, mixed content, unsafe forms, and privacy leaks.',
      'Avoid destructive, intrusive, or out-of-scope testing; stay within the verified journey and available UI.',
      'Classify severity, evidence, likely impact, and remediation clearly.'
    ],
    array[
      'Security and privacy findings',
      'Evidence, impact, and severity',
      'Concrete remediation guidance'
    ],
    true
  )
on conflict (slug) where user_id is null do update
set
  name = excluded.name,
  description = excluded.description,
  role = excluded.role,
  responsibilities = excluded.responsibilities,
  report_focus = excluded.report_focus,
  is_starter = excluded.is_starter,
  updated_at = now();

create table if not exists public.qa_run_personas (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_template_id uuid references public.persona_templates(id) on delete set null,
  position integer not null,
  name text not null,
  role text not null,
  responsibilities text[] not null default '{}'::text[],
  report_focus text[] not null default '{}'::text[],
  goal text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'blocked', 'failed', 'cancelled')),
  result text check (result in ('completed', 'partially_completed', 'blocked')),
  error text,
  issue_count integer not null default 0,
  report_md text,
  video_path text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, position)
);

create index if not exists qa_run_personas_run_id_position_idx
  on public.qa_run_personas(run_id, position);

create index if not exists qa_run_personas_user_id_created_at_idx
  on public.qa_run_personas(user_id, created_at desc);

alter table public.qa_run_personas enable row level security;

drop policy if exists qa_run_personas_all_own on public.qa_run_personas;
create policy "qa_run_personas_all_own" on public.qa_run_personas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.qa_steps
  add column if not exists persona_run_id uuid references public.qa_run_personas(id) on delete cascade;

alter table public.qa_issues
  add column if not exists persona_run_id uuid references public.qa_run_personas(id) on delete cascade;

create index if not exists qa_steps_persona_run_id_step_number_idx
  on public.qa_steps(persona_run_id, step_number);

create index if not exists qa_issues_persona_run_id_created_at_idx
  on public.qa_issues(persona_run_id, created_at);

alter table public.qa_issues
  drop constraint if exists qa_issues_category_check;

alter table public.qa_issues
  add constraint qa_issues_category_check
  check (category in ('bug', 'ux', 'accessibility', 'copy', 'navigation', 'performance', 'security', 'reliability'));
