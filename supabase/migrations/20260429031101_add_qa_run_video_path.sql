alter table public.qa_runs
  add column if not exists video_path text;
