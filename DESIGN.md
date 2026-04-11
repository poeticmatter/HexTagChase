# Hex Tag — Game Design

## Overview

Hex Tag is a two-player asymmetric pursuit game played on a hexagonal grid. One player is the **chaser** and the other is the **evader**. Both players secretly plan their moves and predictions simultaneously each turn, then all actions resolve at once. The chaser wins by closing in; the evader wins by staying alive long enough.

Games are played as a **best-of-N match** with roles swapping each round. The first player to win two consecutive rounds wins the match.

---

## The Board

The board is a hex-shaped grid with a radius of 4 hexes from the center, giving 61 playable hexes total. Coordinates use the axial system (q, r). Maps are authored as static JSON files loaded from `src/maps/`.

### Terrain

**Elevation levels** shape movement cost:
- Level `0` — flat ground (default)
- Level `1–4` — raised terrain; moving uphill costs `1 + deltaH` per step
- Level `-1` — impassable (pit, collapsed hex); no movement in or out

**Obstacles** in legacy map format correspond to elevation `1`. The `elevations` map in a `MapDefinition` is the authoritative terrain source.

**Walls** are soft barriers on edges between adjacent hexes. They add `+1` to the edge cost. Walls do not block a hex — they slow crossing. Unlike obstacles, a wall-blocked edge is always crossable if budget allows.

---

## Players and Roles

### Chaser
- Wins by ending a turn adjacent (distance ≤ 1) to the evader, **with elevation parity** (see Win Conditions).
- Submits a movement destination and a prediction of the evader's destination.

### Evader
- Wins by surviving until the turn limit is reached without being tagged.
- Submits a movement destination and a prediction of the chaser's destination.

Starting positions are defined per map (default: chaser at `(−3, 0)`, evader at `(3, 0)`).

---

## Movement

Each turn, each player has a **movement budget** (default 2; can be configured to 1).

Edge costs:
| Edge type | Cost |
|-----------|------|
| Flat edge (same elevation) | 1 |
| Uphill edge (delta `d`) | `1 + d` |
| Walled edge (flat) | 2 |
| Walled + uphill edge | `2 + d` |
| Impassable hex (elevation `-1`) | blocked |

A player may spend their budget across multiple steps in any combination that does not exceed the total. Movement is computed by Dijkstra over the hex graph — all reachable destinations within budget are valid.

**Mid-step collision**: If both players occupy the same hex at any point during path execution, movement stops there and the chaser's tag condition is evaluated.

---

## Turn Structure

Each turn is a single phase.

### Planning

Both players simultaneously and secretly choose:
- A movement destination (and the path to reach it)
- A prediction of the opponent's destination

Neither player sees the other's choices until resolution.

### Resolution

Once both plans are submitted:

1. Both movement paths execute simultaneously.
2. Mid-step collisions are checked at each step.
3. Win conditions are evaluated at final positions.
4. Both players' predictions are checked against actual final positions.
5. Each player whose prediction was correct gains **+1 budget** for the next turn.

If a player stays in place (chooses their current hex), their path is empty and their position is unchanged.

---

## Predictions and Budget

Both players predict where the opponent will land. A correct prediction earns **+1 movement budget** on the following turn. A wrong prediction earns nothing — there is no penalty.

This means a player can have up to `baseMovement + 1` budget in any given turn. Budget resets to `baseMovement` each turn, then the prediction bonus is applied on top.

There is no separate bonus phase. Prediction rewards feed directly into next-turn budget.

---

## Walls (Soft Barriers)

A wall sits on the edge between two adjacent hexes. Crossing a walled edge costs 1 more than a normal edge. A player on one side of a wall can cross it in a single step as long as the total path cost stays within budget.

Walls do not permanently trap players — any hex is reachable given enough budget or turns.

---

## Win Conditions

| Condition | Winner |
|-----------|--------|
| Chaser ends up at distance 0 from the evader | Chaser |
| Chaser ends up at distance 1 from the evader **and** `chaserElevation ≥ evaderElevation` | Chaser |
| Turn counter reaches `maxTurns` without the chaser winning | Evader |

Distance is the standard axial (cube-coordinate) hex distance. The elevation check at distance 1 means an evader on raised ground cannot be tagged by a chaser standing below.

---

## Multi-Round Match

A match consists of multiple rounds. After each round, the roles swap (the chaser becomes the evader and vice versa). The match ends when one player wins **two consecutive rounds**. That player is the match winner.

`MatchState` tracks:
- `roundNumber` — current round (1-indexed)
- `history` — array of per-round winner player IDs
- `matchWinner` — set when the same player wins two rounds in a row

Between rounds, positions and map state reset to the map's starting configuration. The base movement budget resets to `baseMovement`.

---

## Match Settings

Configured by the host before the game begins.

| Setting | Description | Default |
|---------|-------------|---------|
| Turn Limit | Turns per round the evader must survive | 15 |
| Host Role | Which role the host plays in round 1 | Chaser |
| Base Movement | Movement budget per turn | 2 |
| Map | Which map to play on | (first in registry) |

---

## Map Editor

The in-browser map editor (`MapEditor`) lets players author custom maps. Supported editing modes:
- **Elevation** — click hexes to cycle through elevation levels (0, 1, 2, 3, -1)
- **Wall** — click edges to toggle wall segments
- **Chaser / Evader** — click to set spawn positions

The editor registers the in-progress map into the `mapRegistry` for live preview. Finished maps can be exported as JSON and dropped into `src/maps/` to be bundled.

---

## Simulation

`SimulatorView` runs automated Monte Carlo simulations against any bundled map using configurable AI agents. Simulations run in a Web Worker to keep the UI responsive.

Agent strategies:
- `random` — picks uniformly from all reachable destinations
- `greedy` — minimizes (chaser) or maximizes (evader) distance to opponent
- `lookahead` — models the opponent's greedy response one step ahead

Results show win rates, average game length, prediction accuracy, and per-hex heatmaps.

---

## Networking

The game is peer-to-peer with no server. The host generates a room code; the client joins via URL. All game logic runs on the host; the client receives authoritative state after each resolution. Plans are submitted over an encrypted PeerJS data channel.

The host uses a **commit-and-hold** pattern: it stores its own plan locally, waits for the client's plan, then resolves and broadcasts the new state. This prevents the host from gaining information advantage by observing the network before committing.
