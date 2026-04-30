create table if not exists public.repository_index_jobs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repository_index_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  constraint repository_index_jobs_attempts_check
    check (attempts >= 0 and max_attempts > 0)
);

alter table public.site_github_connections
  add column if not exists repository_index_job_id uuid references public.repository_index_jobs(id) on delete set null;

create index if not exists repository_index_jobs_claim_idx
  on public.repository_index_jobs(status, created_at)
  where status in ('queued', 'running');

create index if not exists repository_index_jobs_site_created_at_idx
  on public.repository_index_jobs(site_id, created_at desc);

create index if not exists site_github_connections_repository_index_job_id_idx
  on public.site_github_connections(repository_index_job_id);

alter table public.repository_index_jobs enable row level security;

drop policy if exists repository_index_jobs_select_own on public.repository_index_jobs;
create policy "repository_index_jobs_select_own" on public.repository_index_jobs
  for select
  using (auth.uid() = user_id);

create or replace function public.enqueue_repository_index_job(
  p_site_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_job_id uuid;
  v_now timestamptz := now();
begin
  update public.repository_index_jobs
  set
    status = 'cancelled',
    finished_at = v_now,
    error = 'Superseded by a newer repository index request',
    locked_by = null,
    locked_at = null,
    heartbeat_at = null,
    updated_at = v_now
  where site_id = p_site_id
    and user_id = p_user_id
    and status in ('queued', 'running');

  insert into public.repository_index_jobs (
    site_id,
    user_id,
    status,
    created_at,
    updated_at
  )
  values (
    p_site_id,
    p_user_id,
    'queued',
    v_now,
    v_now
  )
  returning id into v_job_id;

  update public.site_github_connections
  set
    repository_index_job_id = v_job_id,
    repository_index_status = 'indexing',
    repository_index_started_at = v_now,
    repository_indexed_at = null,
    repository_index_error = null,
    repository_index_file_count = 0,
    updated_at = v_now
  where site_id = p_site_id
    and user_id = p_user_id
    and use_repository_context = true
    and disconnected_at is null;

  if not found then
    raise exception 'GitHub connection not found for repository indexing';
  end if;

  return v_job_id;
end;
$$;

create or replace function public.claim_repository_index_job(
  p_worker_id text,
  p_lock_timeout_seconds integer default 900
)
returns table (
  id uuid,
  site_id uuid,
  user_id uuid,
  attempts integer,
  max_attempts integer
)
language plpgsql
as $$
begin
  return query
  with next_job as (
    select j.id
    from public.repository_index_jobs j
    join public.site_github_connections c
      on c.site_id = j.site_id
      and c.user_id = j.user_id
    where (
        j.status = 'queued'
        or (
          j.status = 'running'
          and j.heartbeat_at < now() - make_interval(secs => p_lock_timeout_seconds)
        )
      )
      and j.attempts < j.max_attempts
      and c.use_repository_context = true
      and c.disconnected_at is null
    order by j.created_at asc
    for update of j skip locked
    limit 1
  )
  update public.repository_index_jobs j
  set
    status = 'running',
    attempts = j.attempts + 1,
    locked_by = p_worker_id,
    locked_at = now(),
    heartbeat_at = now(),
    started_at = coalesce(j.started_at, now()),
    error = null,
    updated_at = now()
  from next_job
  where j.id = next_job.id
  returning j.id, j.site_id, j.user_id, j.attempts, j.max_attempts;
end;
$$;

revoke all on function public.enqueue_repository_index_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_repository_index_job(text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_repository_index_job(uuid, uuid) to service_role;
grant execute on function public.claim_repository_index_job(text, integer) to service_role;
