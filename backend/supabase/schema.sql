create table if not exists public.offices (
  domain text primary key,
  name text not null,
  bundle jsonb not null,
  fingerprint text not null,
  dns_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requests (
  id text primary key,
  office_domain text not null references public.offices(domain) on delete cascade,
  checklist jsonb not null default '[]'::jsonb,
  note text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.handoffs (
  id text primary key,
  office_domain text references public.offices(domain) on delete cascade,
  request_id text references public.requests(id) on delete set null,
  mode text not null check (mode in ('office', 'person')),
  status text not null default 'pending' check (status in ('pending', 'stored', 'opened', 'revoked', 'expired')),
  header jsonb,
  ct_sha256 text,
  padded_size bigint,
  storage_path text not null,
  revoke_token_hash text not null,
  k2 text,
  code_hash text,
  attempts int not null default 0,
  receipt jsonb,
  open_receipt jsonb,
  created_at timestamptz not null default now(),
  stored_at timestamptz,
  opened_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists handoffs_office_idx on public.handoffs (office_domain, created_at desc);
create index if not exists requests_office_idx on public.requests (office_domain, created_at desc);

create table if not exists public.handoff_events (
  id bigserial primary key,
  handoff_id text not null,
  office_domain text,
  type text not null,
  at timestamptz not null default now(),
  prev_hash text not null,
  hash text not null
);

create index if not exists handoff_events_handoff_idx on public.handoff_events (handoff_id, id desc);

create table if not exists public.check_cache (
  org_key text primary key,
  result jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.offices enable row level security;
alter table public.requests enable row level security;
alter table public.handoffs enable row level security;
alter table public.handoff_events enable row level security;
alter table public.check_cache enable row level security;

insert into storage.buckets (id, name, public)
values ('ciphertext', 'ciphertext', false)
on conflict (id) do nothing;
