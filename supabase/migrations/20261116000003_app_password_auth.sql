-- Application-managed sign-in accounts. Passwords are stored only as PBKDF2 hashes.
create table if not exists public.app_accounts (
  id text primary key,
  email text not null unique,
  display_name text not null,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_accounts enable row level security;
grant all privileges on table public.app_accounts to service_role;
