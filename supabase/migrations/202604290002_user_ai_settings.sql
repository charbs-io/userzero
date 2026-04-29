create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_openai_api_key text,
  openai_api_key_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;
