# ANTIGRAVITY.md

This file provides guidance to Antigravity when working with code in this repository. 
It covers the architecture, game rules, and commands required to seamlessly develop the Hex Tag game.

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

### Game Phase Pipeline

Each turn flows through at most two phases:

```
planning  →  [bonus_phase]  →  next turn
```

`planning` always runs. `bonus_phase` only runs in `post-reveal` bonus timing mode — movement resolves first, then the entitled player selects their bonus step interactively. In `pre-commit` mode both phases collapse: movement and bonus resolve together in `_resolveRound()`.

Resolution entry point is `processPhase()` in `hexGameLogic.ts`.

### Map Generation

`generateObstacles` — places up to `count` obstacle hexes.
`generateWalls` — places `wallCount` wall sections (groups of 4–6 connected edge segments). Walls are soft barriers: players can cross them at movement cost 2.

### Weighted Movement (reachableDestinations)

Movement uses a **cost-aware BFS** with a budget of 2:

- Standard edge (no wall): cost 1
- Walled edge: cost 2

A player can cross a wall only by spending their full budget on that single step.

`reachableDestinations(pos, blocked, walls, budget?)` implements this BFS. Do not replace it.
`validNeighbors` is used for bonus targeting (budget-1 hard barrier semantics, walls block).

### Network (useHexGame.ts)
Implements a **commit-and-hold** pattern to prevent host advantage:
- Host stores its plan locally, waits for the client's plan over PeerJS.
- Only when both plans are present does `processPhase()` run. State is broadcast to client.

### Architecture Rules & Change Discipline

- **Decoupling**: UI components react to state values only. All mutations go through `processPhase()`.
- **Predictability**: All game logic flows through the `processPhase()` → `_resolveRound()` pipeline.
- Maintain existing patterns unless explicitly instructed to refactor.
- Do not modify `src/types.ts` without explicit instruction — `TurnPlan` changes cascade.
