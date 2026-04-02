# Hex Tag — Game Design

## Overview

Hex Tag is a two-player asymmetric pursuit game played on a hexagonal grid. One player is the **chaser** and the other is the **evader**. Both players secretly plan their moves simultaneously each turn, then all actions resolve at once. The chaser wins by closing in; the evader wins by staying alive long enough.

---

## The Board

The board is a hex-shaped grid with a radius of 4 hexes from the center, giving 61 playable hexes total. Coordinates use the axial system (q, r).

**Obstacles** are impassable hexes that block movement. They are placed away from starting positions and never form clusters of three or more adjacent hexes. The default count is 12.

**Walls** are soft barriers placed on edges between adjacent hexes. Unlike obstacles, walls do not block a hex — they slow movement across the shared border. They are organized into connected sections of 4–6 edge segments. The default count is 0 wall sections.

---

## Players and Roles

### Chaser
- Wins by ending a turn adjacent (distance ≤ 1) to the evader.
- Submits a movement destination, a prediction of the evader's destination, and optionally a bonus move.

### Evader
- Wins by surviving until the turn limit is reached without the chaser ever closing to distance ≤ 1.
- Submits only a movement destination (and optionally a bonus move).

Starting positions are fixed: chaser at (−3, 0), evader at (3, 0).

---

## Movement

Each turn, every player has a **movement budget of 2**.

- Moving across a standard edge costs **1**.
- Moving across a walled edge costs **2**.

Within a single turn a player may:
- Move 1 standard step (cost 1), then 1 more standard step (cost 1) — total 2.
- Move 1 standard step (cost 1) to land on a hex adjacent to a wall, then cross that wall next turn.
- Cross a wall in a single step (cost 2, full budget spent) — valid only when starting adjacent to the wall.

**A player cannot cross a wall as a second step.** Moving one standard hex then attempting to cross a wall would total cost 3, which exceeds the budget and is not offered as a valid destination.

Movement into an obstacle hex is never permitted.

---

## Turn Structure

Each turn proceeds through up to two phases.

### Planning Phase

Both players simultaneously and secretly choose:

| Player | Choices |
|--------|---------|
| Chaser | Movement destination + prediction of evader's destination + (optionally) a bonus move |
| Evader | Movement destination + (optionally) a bonus move |

Neither player sees the other's choices until resolution.

### Resolution

Once both plans are submitted:

1. Movement executes for both players simultaneously.
2. The chaser's prediction is checked: did the evader actually move to the predicted destination?
3. **Prediction hit** → the chaser earns a bonus step.  
   **Prediction miss** → the evader earns a bonus step.
4. The bonus step is applied.
5. Win conditions are checked.

**Mid-step collision**: If both players would occupy the same hex at any point during movement, they are treated as meeting at that hex and movement stops.

---

## Bonus Moves

The entitled player (chaser on a prediction hit, evader on a miss) may take one additional step of exactly 1 hex. The bonus step is subject to the same wall and obstacle rules as normal movement. The entitled player may decline the bonus by not selecting a destination.

### Bonus Timing Modes

**Pre-commit**: Both players submit their bonus move as part of their planning plan before any moves are revealed. The entitled player's bonus executes if valid; the other player's bonus is discarded.

**Post-reveal**: Movement resolves and is revealed to both players first. Then only the entitled player selects their bonus move in a live follow-up phase.

---

## Walls (Soft Barriers)

A wall sits on the edge between two adjacent hexes. A player standing adjacent to a wall-blocked edge may cross it by spending their full movement budget (cost 2) on that single step. After crossing, the player has no remaining budget for that turn.

Walls do **not** permanently trap players — any hex is always reachable given enough turns. Wall sections are generated such that both players remain connected to each other through the wall layout at the start of the game.

Bonus moves treat walls as hard barriers (the bonus budget is 1, and walls cost 2).

---

## Win Conditions

| Condition | Winner |
|-----------|--------|
| Chaser is distance ≤ 1 from the evader at the end of any resolution step | Chaser |
| The turn counter reaches the configured turn limit without the chaser winning | Evader |

Distance is the standard axial (cube-coordinate) hex distance.

---

## Match Settings

Configured by the host before the game begins, before any opponent connects.

| Setting | Description | Default | Range |
|---------|-------------|---------|-------|
| Turn Limit | Number of turns the evader must survive | 15 | 10–20 |
| Host Role | Which role the host plays | Chaser | Chaser / Evader |
| Bonus Timing | When the bonus move is selected | Pre-commit | Pre-commit / Post-reveal |
| Obstacles | Number of obstacle hexes | 12 | 0–20 |
| Wall Sections | Number of connected wall sections | 0 | 0–4 |

---

## Networking

The game is peer-to-peer with no server. The host generates the board and shares a room code. The client joins by visiting a URL containing that code. All game logic runs on the host; the client receives authoritative state after each resolution. Plans are submitted over an encrypted PeerJS data channel.
