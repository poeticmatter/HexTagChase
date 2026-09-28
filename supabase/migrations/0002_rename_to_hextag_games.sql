-- One table per game on the shared Supabase project.
--
-- Several prototypes share a single Supabase project, so each game owns a table named
-- `<game-id>_games` instead of the generic `games`. Row-level security, the policies and
-- the supabase_realtime publication membership all follow the table through a rename,
-- so nothing else needs re-creating.
--
-- Deploy the matching client build (GAMES_TABLE = 'hextag_games') at the same time:
-- an older build still querying `games` stops working once this runs.

alter table if exists public.games rename to hextag_games;
