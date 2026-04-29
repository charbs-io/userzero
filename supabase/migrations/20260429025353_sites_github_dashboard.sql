do $$
begin
  if to_regclass('public.sites') is null and to_regclass('public.verified_domains') is not null then
    alter table public.verified_domains rename to sites;
  end if;
end $$;

alter table public.sites
  add column if not exists base_url text,
  add column if not exists updated_at timestamptz not null default now();

update public.sites
set base_url = 'https://' || hostname
where base_url is null;

alter table public.sites
  alter column base_url set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sites_base_url_protocol_check'
      and conrelid = 'public.sites'::regclass
  ) then
    alter table public.sites
      add constraint sites_base_url_protocol_check
      check (base_url ~ '^https?://');
  end if;
end $$;

create index if not exists sites_user_id_idx on public.sites(user_id);

drop policy if exists domains_all_own on public.sites;
drop policy if exists sites_all_own on public.sites;
create policy "sites_all_own" on public.sites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.qa_runs
  add column if not exists site_id uuid references public.sites(id) on delete set null;

create index if not exists qa_runs_site_id_created_at_idx on public.qa_runs(site_id, created_at desc);

create table if not exists public.site_github_connections (
  site_id uuid primary key references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id bigint not null,
  repository_id bigint not null,
  owner text not null,
  repo text not null,
  full_name text not null,
  html_url text not null,
  default_branch text not null,
  permissions jsonb not null default '{}'::jsonb,
  use_repository_context boolean not null default true,
  allow_issue_creation boolean not null default false,
  allow_pr_creation boolean not null default false,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_github_connections_user_id_idx
  on public.site_github_connections(user_id);

create index if not exists site_github_connections_installation_id_idx
  on public.site_github_connections(installation_id);

alter table public.site_github_connections enable row level security;

drop policy if exists site_github_connections_all_own on public.site_github_connections;
create policy "site_github_connections_all_own" on public.site_github_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
