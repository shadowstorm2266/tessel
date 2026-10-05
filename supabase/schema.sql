-- Tessel scan log. Run once in the Supabase SQL editor.
create table if not exists scans (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  mint        text not null,
  symbol      text,
  score       int not null,
  verdict     text not null,
  flags       text[] not null default '{}',
  chat_id     bigint not null,
  chat_type   text not null,          -- private | group | supergroup
  user_id     bigint
);

create index if not exists scans_created_at_idx on scans (created_at desc);
create index if not exists scans_mint_idx on scans (mint);
create index if not exists scans_chat_idx on scans (chat_id);

-- Allow the bot (anon key) to insert and read. Tighten later if needed.
alter table scans enable row level security;
create policy "bot insert" on scans for insert to anon with check (true);
create policy "bot read"   on scans for select to anon using (true);

-- Handy aggregate for /stats and for the pitch deck.
create or replace view scan_stats as
select
  count(*)                                   as total_scans,
  count(distinct mint)                       as unique_tokens,
  count(distinct chat_id)                    as unique_chats,
  count(distinct chat_id) filter (where chat_type <> 'private') as groups,
  count(*) filter (where verdict = 'danger') as danger_scans,
  count(*) filter (where created_at > now() - interval '24 hours') as scans_24h
from scans;
