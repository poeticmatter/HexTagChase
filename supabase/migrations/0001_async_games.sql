-- Asynchronous play backing store for Hex Tag.
--
-- One row per game, keyed by the room code. Holds the authoritative GameState plus
-- each player's pending plan for the current turn. Turn resolution runs client-side
-- (see src/lib/asyncGameApi.ts) and writes the resulting state back under a version
-- guard, so this table stores data only — no rules live here.
--
-- There is no auth in this app: knowing the room code is the access credential, the
-- same trust model as the existing PeerJS share link. The permissive RLS policies
-- below are intentional for trusted-friend playtesting; a security advisor will flag
-- them, and that is expected.

create table if not exists public.games (
  id          text primary key,                 -- 4-char room code (uppercased)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  settings    jsonb not null,                   -- MatchSettings
  state       jsonb not null,                   -- GameState (authoritative)
  p1_plan     jsonb,                            -- pending TurnPlan for player 1, null when none
  p2_plan     jsonb,                            -- pending TurnPlan for player 2, null when none
  p2_joined   boolean not null default false    -- flips true when the evader opens the link
);

alter table public.games enable row level security;

create policy "anon read"   on public.games for select using (true);
create policy "anon insert" on public.games for insert with check (true);
create policy "anon update" on public.games for update using (true) with check (true);

-- Realtime so a player who is online sees the board advance live.
alter publication supabase_realtime add table public.games;
