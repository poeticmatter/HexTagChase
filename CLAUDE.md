# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server at http://localhost:3000
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # TypeScript type checking (tsc --noEmit)
npm run clean      # Remove dist directory
npm run deploy     # Build and publish to GitHub Pages
```

Optional: set `DISABLE_HMR=true` in `.env.local` to disable hot module replacement (useful in some AI Studio environments).

## Architecture

Two-player peer-to-peer hex grid game ("Hex Tag"). No backend — PeerJS handles networking directly between browsers.

**Game concept**: A chaser and evader take turns on a hex grid. The chaser wins by reaching an adjacent hex; the evader wins by surviving a configurable number of turns. Both players secretly pre-commit their move and, optionally, a bonus move each round. The chaser also submits a prediction of the evader's destination — a correct prediction earns the chaser a bonus step.

### File Structure

```
src/
├── App.tsx                    # Root component — routes between Lobby and GameView
├── types.ts                   # All core types and discriminated unions
├── main.tsx
├── components/
│   ├── HexBoard.tsx           # SVG hex renderer with click interaction and path arrows
│   ├── Lobby.tsx              # Room creation/join UI with match settings sliders
│   └── PlanningPanel.tsx      # Multi-step input UI with phase and step tracking
├── hooks/
│   └── useHexGame.ts          # PeerJS orchestrator + game state manager
└── lib/
    ├── hexGrid.ts             # Hex coordinate utilities and rendering math
    ├── hexGameLogic.ts        # Core game resolution engine and map generation
    └── matchConfig.ts         # LobbySettings → MatchSettings conversion
```

### Core Data Model

Key types live in `src/types.ts`:

- `HexCoord { q, r }` — axial hex coordinates
- `WallCoord { q1, r1, q2, r2 }` — an edge between two adjacent hexes; traversable at cost 2
- `MatchSettings` — immutable match config: `maxTurns`, `chaserPlayer`, `bonusTiming`, `obstacleCount`, `wallCount`
- `GameState` — positions, obstacles, walls, phase, turn counter, transient context, per-player turn data
- `GamePhase = 'planning' | 'bonus_phase'`
- `TurnPlan` — discriminated union: `ChaserPlan | EvaderPlan | BonusPlan`
- `TransientContext` — ephemeral within-turn data: committed paths (post-reveal mode), bonus entitlement, prediction result

### Match Configuration

`src/lib/matchConfig.ts` is the single conversion point from `LobbySettings` (raw UI state) to `MatchSettings` (resolved, immutable game config).

`LobbySettings` fields:
- `maxTurns` — turn limit (10–20, default 15)
- `hostRole` — which role the host plays
- `bonusTiming` — `'pre-commit'` or `'post-reveal'`
- `obstacleCount` — number of obstacle hexes to generate (0–20, default 12)
- `wallCount` — number of wall sections to generate (0–4, default 0)

All five fields are forwarded verbatim into `MatchSettings`.

### Game Phase Pipeline

Each turn flows through at most two phases:

```
planning  →  [bonus_phase]  →  next turn
```

`planning` always runs. `bonus_phase` only runs in `post-reveal` bonus timing mode — movement resolves first, then the entitled player selects their bonus step interactively. In `pre-commit` mode both phases collapse: movement and bonus resolve together in `_resolveRound()`.

Resolution entry point is `processPhase()` in `hexGameLogic.ts`. It dispatches to `_resolveRound()` (pre-commit) or `_resolveMovementAndTransition()` → `_applyBonusAndFinish()` (post-reveal).

### Map Generation

`generateObstacles(chaserPos, evaderPos, count)` — places up to `count` obstacle hexes. Obstacles are excluded from the board perimeter and must not form clusters of three. No obstacle is placed within 2 hexes of either player's starting position.

`generateWalls(chaserPos, evaderPos, obstacles, wallCount)` — places `wallCount` wall sections (groups of 4–6 connected edge segments). Returns `[]` immediately when `wallCount === 0`. Walls are soft barriers: players can cross them at movement cost 2. Generation enforces: no three consecutive walled edges on any hex, both players remain connected through the wall layout.

### Weighted Movement (reachableDestinations)

Movement uses a **cost-aware BFS** with a budget of 2:

- Standard edge (no wall): cost 1
- Walled edge: cost 2

A player can cross a wall only by spending their full budget on that single step (starting adjacent to the wall). Moving one standard step then attempting to cross a wall totals cost 3 and is rejected.

`reachableDestinations(pos, blocked, walls, budget?)` implements this BFS. Do not replace it with the old two-pass `validNeighbors` loop.

`validNeighbors` remains unchanged — it is used for bonus targeting (budget-1 hard barrier semantics, walls block).

### Path Execution Contract

`executePath(start, dest, blocked, walls)` returns the array of hexes visited (not including start). The UI layer (`HexBoard.tsx`) renders path arrows by iterating this array pairwise — do not change its return type or semantics.

- 1-step standard move: `[dest]`
- 2-step standard move: `[mid, dest]`
- 1-step wall crossing (cost 2, full budget): `[dest]` — no phantom intermediate

`findIntermediateCell` handles the distance-1 case without an `isPassable` check (cost enforcement already happened in `reachableDestinations`). The distance-2 second-leg check (`isPassable(mid, dest, walls)`) is intentionally preserved — it rejects cost-overrun paths (1 standard + 1 walled = 3).

### Networking (Orchestrator)

`useHexGame.ts` implements a **commit-and-hold** pattern to prevent host advantage:

- Host stores its plan locally, waits for the client's plan to arrive over PeerJS
- Only when both plans are present does `processPhase()` run; the resulting state is broadcast to the client
- Client applies received state directly — it never runs resolution itself

Message types are discriminated: `GAME_STATE` (broadcast) and `SUBMIT_PLAN` (player action).

### Architecture Rules

- **Decoupling**: UI components react to state values only. All mutations go through `processPhase()` / `useHexGame`'s dispatch logic — never mutate state directly in components.
- **Predictability**: All game logic flows through the `processPhase()` → `_resolveRound()` pipeline. Do not introduce state mutations outside it.
- **Movement system**: `reachableDestinations` is the authoritative source for valid targets. `validNeighbors` is for 1-step/bonus targeting only. Do not conflate them.

### Change Discipline

- Maintain existing patterns unless explicitly instructed to refactor.
- If a requested change requires touching more than 3 files, state which files will be affected before proceeding.
- Do not modify `src/types.ts` without explicit instruction — `TurnPlan` changes cascade to all exhaustive switches across the codebase.
- Do not alter the PeerJS orchestration, the game phase pipeline, or the path execution contract without explicit instruction.
