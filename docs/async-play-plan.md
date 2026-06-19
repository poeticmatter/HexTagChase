# Implementation Plan: Asynchronous Play via Supabase

## Goal

Let two friends play a full Hex Tag match without being online at the same time.
Each player opens the shared link whenever they like, sees the current board, submits
their move + prediction, and closes the tab. When the second player submits, the turn
resolves and the board advances. No notifications are required (out of scope by request).

This is **additive**: the existing PeerJS live mode stays intact. We add a parallel
"Async" transport that the lobby can select.

---

## Why this is a small change

The codebase is already shaped for it:

- `ActiveGame` (`src/App.tsx`) is transport-agnostic. It consumes a `GameState` plus
  six callbacks/props (`gameState`, `playerRole`, `waitingForPartner`,
  `canStartNextRound`, `submitPlan`, `startNextRound`) and has no knowledge of PeerJS.
  A new async hook that returns the same shape drops straight in.
- `GameState` and `TurnPlan` are plain serializable objects (axial coords, arrays,
  records) — they go directly into a `jsonb` column with no custom (de)serialization.
- The resolution engine is pure: `processPhase(state, p1Plan, p2Plan)`,
  `buildInitialState(settings)`, `buildNextRoundState(state)` in
  `src/lib/hexGameLogic.ts`. It runs identically in either player's browser.

The only thing the live mode relies on that async cannot keep is the **host-in-memory
authoritative hold** (`checkExecutionTrigger` in `src/hooks/useHexGame.ts`). Supabase's
`games` row replaces that hold with durable shared state.

---

## Core design decision: where does resolution run?

**Decision: client-side resolution on the second submit.** Do NOT build a server/edge
resolver for v1.

Rationale:
- Reuses `processPhase` and friends with zero porting. No Deno edge runtime, no logic
  duplication, no drift between client and server rule implementations.
- The player who submits *second* is online by definition, so a browser is always
  available to compute the next state at the exact moment both plans exist.
- `processPhase` is deterministic, so concurrent resolvers compute identical results;
  a turn-guarded conditional UPDATE (below) makes a double-resolve a harmless no-op.

**Accepted tradeoff — plan secrecy.** With client-side resolution the second player's
browser must be able to read the first player's committed plan to resolve it, so the
pending-plan column is readable before resolution. A technically savvy friend could peek
at a submitted-but-unresolved plan. This is acceptable for trusted-friend playtesting
and is called out explicitly here. The clean fix (a Supabase Edge Function that holds
plans server-side and runs resolution where neither plan is ever exposed) is documented
as a future upgrade in the last section — **do not build it for v1**.

There is no user authentication. Access control is "knowing the room code," same trust
model as the existing PeerJS link. Use the Supabase anon/publishable key (safe to ship
in the static bundle).

---

## Data model

Single table, no joins. Pending plans live as nullable columns on the game row so the
"both submitted?" check is one read.

```sql
-- supabase/migrations/0001_async_games.sql

create table public.games (
  id          text primary key,            -- the 4-char room code (uppercased)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  settings    jsonb not null,              -- MatchSettings
  state       jsonb not null,              -- full GameState (authoritative)
  p1_plan     jsonb,                       -- pending TurnPlan for player 1, null when none
  p2_plan     jsonb,                       -- pending TurnPlan for player 2, null when none
  p2_joined   boolean not null default false  -- flips true when the evader opens the link
);

-- Open access (no auth in this app; room code is the secret).
alter table public.games enable row level security;

create policy "anon read"   on public.games for select using (true);
create policy "anon insert" on public.games for insert with check (true);
create policy "anon update" on public.games for update using (true) with check (true);

-- Realtime so a player who happens to be online sees the board advance live.
alter publication supabase_realtime add table public.games;
```

Notes for the executing agent:
- **Create the migration file only — do not apply it.** You do not have access to the
  project, and you must not run `npx supabase db push` or any CLI against it. The SQL file
  is the canonical, source-controlled schema artifact; applying it is handled outside your
  scope (the project owner runs it via the dashboard SQL editor, or via the Supabase MCP in
  the owner's session). Critically, your TypeScript must compile and `npm run build` must
  pass **without the table existing** — do not probe the schema at build time.
- The permissive RLS policies are intentional for this trusted-playtest use case; a
  security advisor will flag them, and that is expected, not a defect to fix.
- Each `TurnPlan` already carries `.turn`, which is the anti-stale key (mirrors the
  `msg.plan.turn !== current.turn` guard in `useHexGame.ts`).

---

## Client integration

### New files

1. **`src/lib/supabaseClient.ts`** — create and export a singleton browser client from
   `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. **Fail lazily, not at
   startup:** if either env var is missing, only surface a clear error when an async game
   is actually initialized — never at module load. A fail-fast throw at import time would
   break the vs-AI and PeerJS-live modes, which need no Supabase config at all. Prefer a
   `getSupabase()` accessor that constructs the client on first async use and throws a
   readable "Supabase not configured" error there.

2. **`src/lib/asyncGameApi.ts`** — thin async wrappers around the table. All game rules
   stay in `hexGameLogic.ts`; this file is pure I/O plus the resolve-orchestration.
   **Error policy:** check the `{ data, error }` of every Supabase call and `throw` on
   `error` — never swallow, never return a sentinel for transport failures. `useHexGameAsync`
   is the handling boundary: it try/catches these and maps them to `ConnectionStatus`
   (`setStatus('error')` + `setErrorMsg`). The one exception is a *missing row* on
   `loadGame` (room not found) — that is normal control flow, so return `null` and let the
   hook render "Game not found," not a thrown error.
   - `createGame(code, settings): Promise<GameState>` — `buildInitialState(settings)`,
     then `insert` the row (`p2_joined` defaults to false). Returns the initial state.
   - `loadGame(code): Promise<{ state, p1_plan, p2_plan, p2_joined } | null>` — `select`
     by id.
   - `joinGameAsPlayer2(code): Promise<void>` — `UPDATE games SET p2_joined = true
     WHERE id = code`. Called once when the evader opens the link; Realtime then flips the
     host from `waiting_for_partner` to `playing`. Idempotent (writing `true` twice is fine).
   - `submitPlan(code, role, plan): Promise<void>`:
     1. `UPDATE games SET p{role}_plan = plan WHERE id = code AND (state->>'turn')::int = plan.turn`
        (the turn guard rejects stale submissions).
     2. Re-fetch the row.
     3. If **both** `p1_plan` and `p2_plan` are present: compute
        `next = processPhase(state, p1_plan, p2_plan)` and run the **guarded resolve**:
        `UPDATE games SET state = next, p1_plan = null, p2_plan = null, updated_at = now()
        WHERE id = code AND (state->>'turn')::int = <currentTurn>`.
        The `turn` guard means if the other player's browser already resolved, this write
        matches zero rows and is a safe no-op.
   - `startNextRound(code): Promise<void>` — `next = buildNextRoundState(state)`, then a
     guarded `UPDATE ... WHERE id = code AND (state->>'roundNumber'...)` so two players on
     the round-win screen can't double-advance. Either player may call it (see below).

   Keep the JS-side optimistic locking simple: the turn/round value embedded in `state`
   is the version. Always resolve/advance inside a `WHERE` that pins that version.

3. **`src/hooks/useHexGameAsync.ts`** — mirrors the public surface of `useHexGame`
   (`{ gameState, status, errorMsg, waitingForPartner, submitPlan, startNextRound }`) so
   `App.tsx` can swap transports with no change to `ActiveGame`. Responsibilities:
   - On mount: host (`role === 1`) creates the row if it doesn't exist and sits in
     `'waiting_for_partner'`; client (`role === 2`) loads it and calls
     `joinGameAsPlayer2`. Map missing row / load failure to the existing
     `ConnectionStatus` values (`'error'`, `'waiting_for_level'`, `'playing'`, etc.) so the
     status screens in `App.tsx` keep working unchanged.
   - **Status from `p2_joined`:** the host stays in `'waiting_for_partner'` until the row's
     `p2_joined` flips to true (delivered via Realtime), then moves to `'playing'`. This is
     the explicit signal that the evader has arrived — don't try to infer presence from
     plan columns.
   - Subscribe to Supabase Realtime `postgres_changes` on this `id`; on every update call
     `setGameState(row.state)`. This gives live play when both are online and a fresh board
     on next visit otherwise. No polling loop needed.
   - Derive `waitingForPartner` from the row: true when this player's pending plan column
     is set but `state.turn` has not advanced (i.e. opponent hasn't submitted yet).
   - `submitPlan` / `startNextRound` delegate to `asyncGameApi`; Realtime delivers the
     resulting state back through the subscription (no manual local apply needed, but a
     local optimistic `setGameState` after a successful resolve is fine for snappiness).

### Changed files (this feature touches more than 3 files — flagged per change discipline)

4. **`src/App.tsx`**
   - Extend `GameConfig` with an async variant (e.g. add `transport: 'live' | 'async'` to
     the existing `pvp` mode, or add a sibling `mode: 'async'`). Prefer adding
     `transport` to the pvp config so `role`/`code`/`settings` plumbing is reused.
   - Route async configs to a new `AsyncGameView` that calls `useHexGameAsync` instead of
     `useHexGame` and renders the same `ActiveGame`.
   - **Transport is encoded in the URL, not probed.** Async share links carry
     `?room=CODE&mode=async`; live links stay `?room=CODE`. On join, read
     `params.get('mode')` — absent defaults to `'live'`, which keeps every existing link
     working unchanged. Do **not** "try Supabase, fall back to PeerJS": explicit is better
     than implicit, it avoids a failed lookup on every live join, and it lets live-mode
     joiners work with no Supabase config present. Append `&mode=async` when building the
     async share URL (the `WaitingForPartner` URL builder at `App.tsx:48`).
   - **Join path:** when arriving via `?room=CODE&mode=async`, the joiner's `settings` are
     unknown locally — they must come from the loaded row (`state.settings`), not from
     `resolveMatchSettings`. `useHexGameAsync` should load settings from the row for role 2
     rather than expecting them as a prop. Decide role with the same convention as today
     (creator = role 1, link-opener = role 2) and persist it (next item).
   - **Role persistence:** store the assigned `playerRole` in `localStorage` keyed by room
     code so reopening the link resumes the same side instead of re-assigning.

5. **`src/components/Lobby.tsx`** + **`src/lib/matchConfig.ts`**
   - Add a transport toggle to the lobby form: **"Live (P2P)"** vs **"Async (Supabase)"**.
     Recommend defaulting to Async, since cross-timezone playtest is the stated goal.
   - Thread the choice through `LobbySettings` (add `transport: 'live' | 'async'`) and into
     `handleCreateGame` in `App.tsx`. `resolveMatchSettings` does not need the transport
     value (it's a UI/routing concern, not a rule), so keep `MatchSettings` unchanged —
     pass `transport` alongside, not inside, the resolved settings.

6. **`package.json`** — add `@supabase/supabase-js`.

7. **`.env.example`** (new) and local `.env.local` — document
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The GitHub Pages deploy is a static
   build, so these are inlined at build time; the anon key in the bundle is expected and
   safe.

### Explicitly NOT touched

- `src/types.ts` — no `TurnPlan`/`GameState` shape changes are needed; the existing types
  serialize as-is. (Per change discipline, leave `types.ts` alone.)
- `src/lib/hexGameLogic.ts` — resolution engine is reused unchanged.
- `src/hooks/useHexGame.ts` and the PeerJS path — left fully intact.
- The Monte Carlo simulator, map editor, and map registry — unrelated.

---

## "Start Next Round" in async mode

In live mode only the host (role 1) advances rounds. In async the host may be offline at
the moment a round ends, which would stall the match. Decouple it: in async mode **either**
player may press "Start Next Round," and the action is a version-guarded UPDATE
(`WHERE` pinned to the just-finished round) so a simultaneous press from both players
advances exactly once. Set `canStartNextRound` to `true` for both roles in `AsyncGameView`.

---

## Edge cases the executing agent must handle

- **Stale submit:** plan whose `.turn` ≠ current `state.turn` → guarded UPDATE matches no
  rows; surface nothing or a soft "the board already moved on, reloading" and refetch.
- **Resubmission / double click:** writing your own pending-plan column twice is
  idempotent; guard the UI so a player can't change a plan the opponent has already
  resolved against (turn guard covers correctness; UI should just disable after submit).
- **Concurrent second-submits / concurrent resolves:** handled by the turn-pinned
  conditional UPDATE — deterministic `processPhase` + version guard = one effective write.
- **Missing/expired room on join:** map to the existing `'error'` status with a clear
  message ("Game not found — check the link").
- **Realtime drop:** Realtime is a convenience, not a correctness dependency. The
  load-on-mount fetch is the source of truth; a player who never receives a live event
  still sees the current board the next time they open the link.

---

## Verification steps

1. `npm run lint` (tsc) **and** `npm run build` pass — the build step catches env-var
   inlining problems and any Supabase import that `tsc` alone would miss.
2. Two browser profiles, **non-overlapping in time**: profile A creates an async game and
   submits a plan, then closes the tab. Profile B opens the link later, sees A's board,
   submits, and observes the turn resolve and advance. Reopen A's link — it shows the
   advanced board. This is the core async acceptance test.
3. Both profiles open at once: confirm Realtime advances both boards live (async mode
   should feel like live mode when both are present).
4. **Role retention:** refresh both tabs independently and confirm each player keeps the
   correct side (Chaser/Evader) via the `localStorage` role lookup, rather than being
   re-assigned.
5. Play a full round to a win and confirm "Start Next Round" works when triggered by the
   non-host player, and that a simultaneous press from both players advances only once.
6. Confirm the existing Live (P2P) mode is unchanged, including with Supabase env vars
   absent (lazy-failure check — AI and live modes must still work unconfigured).

---

## Out of scope for v1 (do not build)

- **Notifications** — explicitly excluded.
- **Authentication / per-player RLS** — trusted friends + room code only.
- **Edge-function hidden-commit resolver** — the secure upgrade that keeps the opponent's
  pending plan unreadable until both are in. If plan secrecy ever matters, port the
  `processPhase` call into a Supabase Edge Function that (a) accepts a single player's
  plan, (b) stores it without returning the opponent's, and (c) resolves server-side when
  both are present, writing only the resulting `state`. This removes the one tradeoff of
  the v1 design. Leave it for later.
```
