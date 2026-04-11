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

**Game concept**: A chaser and evader take turns on a hex grid. Both players secretly plan their move and a prediction of the opponent's destination simultaneously. Correct predictions earn a bonus movement budget step on the next turn. The chaser wins by reaching an adjacent hex (with elevation parity); the evader wins by surviving a configurable number of turns. Games are played as best-of-N rounds with alternating roles.

### File Structure

```
src/
├── App.tsx                    # Root component — routes between Lobby, GameView, MapEditor, SimulatorView
├── types.ts                   # All core types and discriminated unions
├── main.tsx
├── components/
│   ├── HexBoard.tsx           # SVG hex renderer with click interaction, path arrows, elevation shading
│   ├── Lobby.tsx              # Room creation/join UI with map picker and match settings
│   ├── MapEditor.tsx          # In-browser map authoring tool (elevation, walls, spawn points)
│   ├── MapThumbnail.tsx       # Small static SVG preview of a MapDefinition
│   ├── PlanningPanel.tsx      # Multi-step input UI with phase and step tracking
│   └── SimulatorView.tsx      # Monte Carlo simulation runner with heatmap visualization
├── hooks/
│   └── useHexGame.ts          # PeerJS orchestrator + game state manager
├── lib/
│   ├── hexGrid.ts             # Hex coordinate utilities and rendering math
│   ├── hexGameLogic.ts        # Core game resolution engine (processPhase, reachableDestinations, etc.)
│   ├── mapRegistry.ts         # Singleton registry — loads and validates all src/maps/*.json at startup
│   ├── mapSchemaValidators.ts # Runtime JSON validation for MapDefinition
│   ├── matchConfig.ts         # LobbySettings → MatchSettings conversion
│   ├── monteCarloSimulator.ts # Single-threaded simulation loop (used by the web worker)
│   ├── simulationAgent.ts     # Agent strategies: random, greedy, lookahead
│   ├── simulationTypes.ts     # SimulationConfig and SimulationResult types
│   └── topography.ts          # Elevation map helpers (buildElevationsMap, getBaseElevation)
├── maps/
│   ├── standard-arena.json    # Bundled map definitions (loaded eagerly by MapRegistry)
│   ├── fences.json
│   ├── honey.json
│   ├── pits.json
│   ├── spokes.json
│   └── the-hug.json
└── workers/
    └── simulationWorker.ts    # Web worker entry point — runs monteCarloSimulator off-thread
```

### Core Data Model

Key types live in `src/types.ts`:

- `HexCoord { q, r }` — axial hex coordinates
- `WallCoord { q1, r1, q2, r2 }` — an edge between two adjacent hexes; traversable at extra cost
- `MapDefinition` — static map data: `id`, `name`, `chaserStart`, `evaderStart`, `obstacles`, `walls`, optional `elevations`
- `MatchSettings` — immutable match config: `maxTurns`, `chaserPlayer`, `baseMovement`, `mapId`
- `GameState` — positions, obstacles, walls, elevations, turn counter, per-player budgets, transient context, per-player turn data
- `MatchState` — multi-round tracking: `roundNumber`, `history` (per-round winners), `matchWinner`
- `TurnPlan` — discriminated union: `ChaserPlan | EvaderPlan` (both carry `moveDest`, `movePath`, `predictDest`)
- `TransientContext` — ephemeral within-turn scratch space (currently empty; reserved for future use)
- `ResolutionSummary { chaserPredHit, evaderPredHit }` — stored as `lastResolution` for UI display
- `ConnectionStatus` — PeerJS lifecycle states including `'waiting_for_level'`

There is no `GamePhase` type and no `bonus_phase` — the bonus system was replaced by the prediction-budget mechanic.

### Match Configuration

`src/lib/matchConfig.ts` is the single conversion point from `LobbySettings` (raw UI state) to `MatchSettings` (resolved, immutable game config).

`LobbySettings` fields:
- `maxTurns` — turn limit per round
- `hostRole` — `'Chaser'` or `'Evader'`
- `baseMovement` — `1 | 2`, the default per-turn movement budget
- `mapId` — id of the selected map from the registry

All four fields are forwarded into `MatchSettings` (with `hostRole` converted to `chaserPlayer: 1 | 2`).

### Elevation System

`src/lib/topography.ts` manages elevation.

Elevation contract:
- `-1` — impassable hex (pits, destroyed terrain); movement in or out is completely blocked
- `0` — flat ground (default for unlisted hexes)
- `1–4` — raised terrain; uphill movement costs `1 + deltaH` per edge

`buildElevationsMap(mapDef)` merges the map's `elevations` record with a legacy fallback (obstacles not listed in `elevations` default to level `1`).

`getBaseElevation(q, r, elevations)` returns the integer elevation for a hex, defaulting to `0`.

**Tag rule**: The chaser catches the evader at distance 1 only if `chaserElevation >= evaderElevation`. Same hex (distance 0) always counts.

### Map Registry

`src/lib/mapRegistry.ts` exports a singleton `mapRegistry` (instance of `MapRegistry`).

Maps are loaded from `src/maps/*.json` using Vite's `import.meta.glob` with `{ eager: true }`. Every file is validated at module initialization via `mapSchemaValidators.ts`. Duplicate `id` values keep the first loaded; if all files fail validation the registry injects a failsafe map to prevent empty-state crashes.

`mapRegistry.registerMap(mapDef)` — runtime registration, used by the map editor for preview.

### Game Phase Pipeline

Each turn is a single phase:

```
planning  →  resolution  →  next turn (or next round, or match over)
```

Resolution entry point is `processPhase(state, p1Plan, p2Plan)` in `hexGameLogic.ts`. It calls `_resolveRound()`, which:

1. Executes both movement paths simultaneously, checking for mid-step collisions.
2. Checks win condition (chaser adjacent to evader with elevation parity, or turn limit reached).
3. On round win, updates `MatchState` history; sets `matchWinner` if the same player wins two consecutive rounds.
4. Evaluates both players' predictions against actual final positions.
5. Grants +1 budget to any player whose prediction was correct (applied to the *next* turn).

There is no `bonus_phase`. The two-phase `post-reveal` bonus system has been removed.

### Weighted Movement (reachableDestinations)

Movement uses **Dijkstra** with a per-turn budget (`baseMovement`, default 2):

- Standard flat edge: cost `1`
- Uphill edge (elevation delta `d`): cost `1 + d`
- Walled edge: `+1` on top of the base cost
- Impassable hex (elevation `-1`): never entered

`reachableDestinations(pos, elevations, walls, budget?)` returns a `Map<string, HexCoord[]>` — keys are `"q,r"` strings, values are the full path from `pos` to that destination (not including `pos`).

`validNeighbors(pos, blocked, walls, elevations)` returns adjacent hexes that are on-board, not wall-blocked, and not elevation `-1`. It is used for connectivity checks; do not use it as a substitute for `reachableDestinations` in gameplay targeting.

### Networking (Orchestrator)

`useHexGame.ts` implements a **commit-and-hold** pattern to prevent host advantage:

- Host stores its plan locally, waits for the client's plan to arrive over PeerJS
- Only when both plans are present does `processPhase()` run; the resulting state is broadcast to the client
- Client applies received state directly — it never runs resolution itself

Message types are discriminated: `GAME_STATE` (broadcast) and `SUBMIT_PLAN` (player action).

### Monte Carlo Simulator

`SimulatorView.tsx` lets users run automated simulations against any map. The simulation runs in a `Web Worker` (`src/workers/simulationWorker.ts`) to keep the UI responsive. It uses `monteCarloSimulator.ts` (the simulation loop) and `simulationAgent.ts` (agent strategies).

Agent strategies: `'random'` (uniform random pick), `'greedy'` (minimize/maximize distance), `'lookahead'` (models opponent's greedy response one step ahead).

Results include win rates, average game length, prediction accuracy, and per-hex heatmaps (landing frequency, win correlation).

### Architecture Rules

- **Decoupling**: UI components react to state values only. All mutations go through `processPhase()` / `useHexGame`'s dispatch logic — never mutate state directly in components.
- **Predictability**: All game logic flows through the `processPhase()` → `_resolveRound()` pipeline. Do not introduce state mutations outside it.
- **Movement system**: `reachableDestinations` is the authoritative source for valid targets. Do not replace it with simpler neighbor lookups.
- **Map data**: All map content comes from `src/maps/*.json` via `mapRegistry`. Do not hardcode map geometry in game logic or components.

### Change Discipline

- Maintain existing patterns unless explicitly instructed to refactor.
- If a requested change requires touching more than 3 files, state which files will be affected before proceeding.
- Do not modify `src/types.ts` without explicit instruction — `TurnPlan` changes cascade to all exhaustive switches across the codebase.
- Do not alter the PeerJS orchestration or the game phase pipeline without explicit instruction.
- Do not add new map files without a corresponding entry in the registry validation schema.
