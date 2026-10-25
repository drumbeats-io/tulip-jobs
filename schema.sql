create table accounts (
  id    uuid primary key default gen_random_uuid(),
  email text not null unique
);
create table balances (
  account_id uuid not null references accounts(id),
  asset      text not null,
  available  numeric(30,10) not null default 0,
  reserved   numeric(30,10) not null default 0,
  primary key (account_id, asset)
);
create table transactions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id),
  kind         text not null,              -- deposit | withdrawal
  asset        text not null,              -- BTC | EUR
  amount       numeric(30,10) not null,
  status       text not null default 'pending',
  external_ref text,
  created_at   timestamptz not null default now()
);
create table outbox (
  id           uuid primary key default gen_random_uuid(),
  topic        text not null,              -- becomes the BullMQ job name
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  published_at timestamptz
);
create index outbox_unpublished on outbox (created_at) where published_at is null;
create table wallet_balances (
  asset       text primary key,
  amount      numeric(30,10) not null,
  observed_at timestamptz not null default now()
);
