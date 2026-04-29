alter table public.site_github_connections
  add column if not exists repository_vector_store_id text,
  add column if not exists repository_index_status text not null default 'not_indexed',
  add column if not exists repository_indexed_branch text,
  add column if not exists repository_indexed_sha text,
  add column if not exists repository_index_started_at timestamptz,
  add column if not exists repository_indexed_at timestamptz,
  add column if not exists repository_index_error text,
  add column if not exists repository_index_file_count integer not null default 0,
  add column if not exists repository_index_openai_key_fingerprint text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_github_connections_repository_index_status_check'
      and conrelid = 'public.site_github_connections'::regclass
  ) then
    alter table public.site_github_connections
      add constraint site_github_connections_repository_index_status_check
      check (repository_index_status in ('not_indexed', 'indexing', 'ready', 'failed'));
  end if;
end $$;

create index if not exists site_github_connections_repository_index_status_idx
  on public.site_github_connections(user_id, repository_index_status);

alter table public.qa_issues
  add column if not exists github_issue_number integer,
  add column if not exists github_issue_url text,
  add column if not exists github_issue_created_at timestamptz,
  add column if not exists github_pr_number integer,
  add column if not exists github_pr_url text,
  add column if not exists github_pr_branch text,
  add column if not exists github_pr_created_at timestamptz;
