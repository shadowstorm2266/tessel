-- Tessel migration 002: alert feed + split stats.
-- Run once in the Supabase SQL editor.

-- Mints already posted to the alert channel (survives redeploys, no duplicate posts).
create table if not exists alerts (
  mint       text primary key,
  posted_at  timestamptz not null default now(),
  score      int not null,
  verdict    text not null
);
alter table alerts enable row level security;
create policy "bot insert alerts" on alerts for insert to anon with check (true);
create policy "bot read alerts"   on alerts for select to anon using (true);

-- Stats now separate real users from the automated feed.
drop view if exists scan_stats;
create view scan_stats as
select
  count(*) filter (where chat_type <> 'feed')                                   as user_scans,
  count(*) filter (where chat_type <> 'feed' and created_at > now() - interval '24 hours') as user_scans_24h,
  count(distinct user_id) filter (where chat_type <> 'feed')                    as unique_users,
  count(distinct chat_id) filter (where chat_type in ('group','supergroup'))    as groups,
  count(*) filter (where chat_type = 'inline')                                  as inline_scans,
  count(*) filter (where chat_type = 'feed')                                    as feed_scans,
  count(*) filter (where chat_type = 'feed' and verdict = 'danger')             as feed_danger,
  count(*) filter (where chat_type = 'feed' and 'lp_pullable' = any(flags))     as feed_lp_pullable,
  count(*) filter (where chat_type = 'feed' and 'burner_deployer' = any(flags)) as feed_burner,
  count(distinct mint)                                                          as unique_tokens
from scans;
