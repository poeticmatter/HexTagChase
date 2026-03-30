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

**Game concept**: A chaser and evader take turns on a hex grid. The chaser wins by reaching an adjacent hex; the evader wins by surviving 15 turns. Both players choose their movement, a predicted destination for their opponent, and an optional bonus move each round.

### File Structure

```
src/
├── App.tsx                    # Root component — routes between Lobby and GameView
├── types.ts                   # All core types and discriminated unions
├── main.tsx
├── components/
│   ├── HexBoard.tsx           # SVG hex renderer with drag/click interaction
│   ├── Lobby.tsx              # Room creation/join UI
│   └── PlanningPanel.tsx      # Multi-phase input UI with step tracking
├── hooks/
│   └── useHexGame.ts          # PeerJS orchestrator + game state manager
└── lib/
    ├── hexGrid.ts             # Hex coordinate utilities and rendering math
    ├── hexGameLogic.ts        # Core game resolution engine and map generation
    └── powers/
        ├── IAthletePower.ts   # Interface + BasePower abstract class
        ├── PowerFactory.ts    # Factory — maps PowerName → strategy instance
        ├── Standard.ts        # Baseline: 2-step move, prediction, bonus
        ├── Vault.ts           # Cancels movement if opponent predicts landing
        ├── Juke.ts            # Reacting phase: decides execution after seeing opponent
        ├── Line.ts            # Chooses between two targets; opponent can't predict both
        ├── Idle.ts            # Can skip move; grants range_3 buff next turn
        ├── Climber.ts         # Can traverse obstacles in a 2-step move
        └── Declarer.ts        # Declares intended target; bonus if fulfilled
```

### Core Data Model

Key types live in `src/types.ts`:

- `HexCoord { q, r }` — axial hex coordinates
- `GameState` — positions, obstacles, walls, phase, turn counter, modifiers, transient context
- `GamePhase = 'declaring' | 'planning' | 'reacting'` (resolution is implicit after reacting)
- `PowerName` — union of all 7 power names
- `TurnPlan` — discriminated union: `StandardPlan | LinePlan | IdlePlan | DeclarationPlan | ReactionPlan`
- `Modifier { role, effect, expiresAtTurn }` — persistent turn buffs (e.g., `range_3` from Idle)

### Game Phase Pipeline

Each turn flows through active phases in order, then resolves:

```
declaring  →  planning  →  reacting  →  _resolveRound()  →  next turn
```

Only phases declared by one of the active powers via `requiresPhase()` run. Planning always runs. After resolution, `transientContext` (declarations, unmasked moves, reaction plans) is reset.

### Athlete Powers System

Powers follow the **Strategy Pattern**: each extends `BasePower` and overrides only the hooks it needs.

| Hook | Purpose |
|------|---------|
| `onReachableDestinationsRequest()` | Modify available movement targets |
| `onBeforeMoveExecution()` | Abort movement (return `false` to cancel) |
| `onPathExecution()` | Alter the path taken |
| `onBonusCalculation()` | Control self-bonus and nullify opponent bonus |
| `onRoundEnd()` | Add modifiers or persist state |
| `requiresPhase()` / `getRequiredSteps()` | Declare which phases and UI steps are needed |

`_resolveRound()` in `hexGameLogic.ts` calls these hooks in strict order for both players. Powers are fully encapsulated — core logic does not reference specific power names.

### Adding a New Power

Adding a power requires exactly these four steps (never partially implement):

1. Create `src/lib/powers/MyPower.ts` extending `BasePower`, override relevant hooks
2. Add the name to the `PowerName` union in `src/types.ts`
3. If the power needs a new plan shape, add it to the `TurnPlan` discriminated union in `src/types.ts` and handle it in all exhaustive switches
4. Register it in `PowerFactory.getPowerStrategy()` in `src/lib/powers/PowerFactory.ts`

### Networking (Orchestrator)

`useHexGame.ts` implements a **commit-and-hold** pattern to prevent host advantage:

- Host stores its plan locally, waits for the client's plan to arrive over PeerJS
- Only when both plans are present does `processPhase()` run; the resulting state is broadcast to the client
- Client applies received state directly — it never runs resolution itself

Message types are discriminated: `GAME_STATE` (broadcast) and `SUBMIT_PLAN` (player action).

### Architecture Rules

- **Decoupling**: UI components react to state values only. All mutations go through `processPhase()` / `useHexGame`'s dispatch logic — never mutate state directly in components.
- **Single Responsibility**: Each power class does one thing. Do not add unrelated logic to existing power hooks or `hexGameLogic.ts`.
- **Predictability**: All game logic flows through the `processPhase()` → `_resolveRound()` pipeline. Do not introduce state mutations outside it.
- **OCP compliance**: Adding powers must not require changes to `hexGameLogic.ts` — only hook overrides and factory registration.

### Change Discipline

- Maintain existing patterns unless explicitly instructed to refactor.
- If a requested change requires touching more than 3 files, state which files will be affected before proceeding.
- Do not modify `src/types.ts` without explicit instruction — `TurnPlan` and `PowerName` changes cascade to all exhaustive switches across the codebase.
- When adding a new power, always complete all four steps above. Never partially implement.
