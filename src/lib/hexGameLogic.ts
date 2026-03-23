import type { HexCoord, GameState, TurnPlan, PredictionQuality, ResolutionSummary } from '../types'
import { HEX_RADIUS, hexDistance, isOnBoard, HEX_DIRECTIONS, getAllHexes } from './hexGrid'

export const MAX_TURNS = 20

// ── Starting positions ─────────────────────────────────────────────────────

export function getInitialPositions(): { chaserPos: HexCoord; evaderPos: HexCoord } {
  return {
    chaserPos: { q: -3, r: 0 },
    evaderPos: { q: 3, r: 0 },
  }
}

// ── Obstacles ──────────────────────────────────────────────────────────────

export function obstacleSet(obstacles: HexCoord[]): Set<string> {
  return new Set(obstacles.map(h => `${h.q},${h.r}`))
}

/**
 * Returns true if placing an obstacle at `hex` would create a connected cluster of 3+.
 * A cluster of 3 forms when the new hex joins two already-adjacent obstacles,
 * or when it extends a pair (a neighbor that already has its own obstacle neighbor).
 */
function wouldMakeClusterOfThree(hex: HexCoord, placed: Set<string>): boolean {
  const obstacleNeighbors = Object.values(HEX_DIRECTIONS)
    .map(({ dq, dr }) => ({ q: hex.q + dq, r: hex.r + dr }))
    .filter(n => placed.has(`${n.q},${n.r}`))

  // Two or more obstacle neighbors → merges separate groups or extends beyond 2
  if (obstacleNeighbors.length >= 2) return true

  // One obstacle neighbor → only safe if that neighbor has no other obstacle neighbors
  if (obstacleNeighbors.length === 1) {
    const neighbor = obstacleNeighbors[0]
    const neighborObstacleNeighborCount = Object.values(HEX_DIRECTIONS)
      .map(({ dq, dr }) => ({ q: neighbor.q + dq, r: neighbor.r + dr }))
      .filter(n => placed.has(`${n.q},${n.r}`) && !(n.q === hex.q && n.r === hex.r))
      .length
    if (neighborObstacleNeighborCount >= 1) return true
  }

  return false
}

export function generateObstacles(chaserPos: HexCoord, evaderPos: HexCoord): HexCoord[] {
  const allHexes = getAllHexes()

  // Exclude the outer two rings and hexes too close to starting positions
  const candidates = allHexes.filter(({ q, r }) => {
    const notNearEdge    = hexDistance(0, 0, q, r) < HEX_RADIUS
    const clearOfChaser  = hexDistance(q, r, chaserPos.q, chaserPos.r) > 2
    const clearOfEvader  = hexDistance(q, r, evaderPos.q, evaderPos.r) > 2
    return notNearEdge && clearOfChaser && clearOfEvader
  })

  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const target = Math.round(allHexes.length / 6)
  const placed = new Set<string>()
  const result: HexCoord[] = []

  for (const hex of candidates) {
    if (result.length >= target) break
    if (wouldMakeClusterOfThree(hex, placed)) continue
    placed.add(`${hex.q},${hex.r}`)
    result.push(hex)
  }

  return result
}

// ── Neighbors ─────────────────────────────────────────────────────────────

/** All valid (on-board, non-obstacle) neighbors of a hex. */
export function validNeighbors(pos: HexCoord, blocked: Set<string>): HexCoord[] {
  return Object.values(HEX_DIRECTIONS)
    .map(({ dq, dr }) => ({ q: pos.q + dq, r: pos.r + dr }))
    .filter(({ q, r }) => isOnBoard(q, r) && !blocked.has(`${q},${r}`))
}

/** Direction index (1-6) between two adjacent hexes, or null if not adjacent. */
export function directionBetween(from: HexCoord, to: HexCoord): number | null {
  const dq = to.q - from.q
  const dr = to.r - from.r
  for (const [idx, dir] of Object.entries(HEX_DIRECTIONS)) {
    if (dir.dq === dq && dir.dr === dr) return Number(idx)
  }
  return null
}

// ── Prediction assessment ─────────────────────────────────────────────────

/**
 * For each of the two planned steps, check whether the predicted direction matches
 * the actual direction. A matched step is cancelled — the character skips it.
 *
 * Direction for step 1: from shared start to step1.
 * Direction for step 2: from actual step1 to step2 (vs predicted step1 to predicted step2).
 * Both are purely directional comparisons, independent of absolute positions.
 */
function matchedSteps(
  start: HexCoord,
  actualStep1: HexCoord,
  actualStep2: HexCoord,
  predictedStep1: HexCoord,
  predictedStep2: HexCoord,
): [boolean, boolean] {
  const actualDir1 = directionBetween(start, actualStep1)
  const actualDir2 = directionBetween(actualStep1, actualStep2)
  const predDir1   = directionBetween(start, predictedStep1)
  const predDir2   = directionBetween(predictedStep1, predictedStep2)

  const match1 = actualDir1 !== null && predDir1 !== null && actualDir1 === predDir1
  const match2 = actualDir2 !== null && predDir2 !== null && actualDir2 === predDir2
  return [match1, match2]
}

function qualityFromMatches(cancelled: [boolean, boolean]): PredictionQuality {
  const count = (cancelled[0] ? 1 : 0) + (cancelled[1] ? 1 : 0)
  if (count === 2) return 'full'
  if (count === 1) return 'partial'
  return 'none'
}

// ── Movement ──────────────────────────────────────────────────────────────

function stepOne(pos: HexCoord, dirIndex: number, blocked: Set<string>): HexCoord {
  const dir = HEX_DIRECTIONS[dirIndex]
  if (!dir) return pos
  const nq = pos.q + dir.dq
  const nr = pos.r + dir.dr
  if (!isOnBoard(nq, nr) || blocked.has(`${nq},${nr}`)) return pos
  return { q: nq, r: nr }
}

/**
 * Execute a 2-step planned path with per-step cancellation.
 * Cancelled steps are skipped; the remaining step(s) still execute from current position.
 * Returns the sequence of positions actually visited (0–2 entries).
 *
 * Example: plan [up, left], cancelled=[true, false] (step 1 cancelled)
 *   → only "left" executes, from the original start position → 1 position in result.
 */
function executePath(
  startPos: HexCoord,
  step1Target: HexCoord,
  step2Target: HexCoord,
  cancelled: [boolean, boolean],
  blocked: Set<string>,
): HexCoord[] {
  const dir1 = directionBetween(startPos, step1Target)
  const dir2 = directionBetween(step1Target, step2Target)

  const visited: HexCoord[] = []
  let pos = startPos

  if (!cancelled[0] && dir1 !== null) {
    pos = stepOne(pos, dir1, blocked)
    visited.push(pos)
  }

  if (!cancelled[1] && dir2 !== null) {
    pos = stepOne(pos, dir2, blocked)
    visited.push(pos)
  }

  return visited
}

// ── Round resolution ───────────────────────────────────────────────────────

export function resolveRound(
  state: GameState,
  p1Plan: TurnPlan,
  p2Plan: TurnPlan,
): GameState {
  const { chaserPos, evaderPos, obstacles, turn } = state
  const baseBlocked = obstacleSet(obstacles)

  // Determine which steps are cancelled for each player (opponent's matched prediction cancels that step)
  const chaserCancelledSteps = matchedSteps(
    chaserPos, p1Plan.moveStep1, p1Plan.moveStep2,
    p2Plan.predictStep1, p2Plan.predictStep2,
  )
  const evaderCancelledSteps = matchedSteps(
    evaderPos, p2Plan.moveStep1, p2Plan.moveStep2,
    p1Plan.predictStep1, p1Plan.predictStep2,
  )

  // Move chaser with their cancelled steps applied
  const chaserBlocked = new Set([...baseBlocked, `${evaderPos.q},${evaderPos.r}`])
  const chaserPath = executePath(chaserPos, p1Plan.moveStep1, p1Plan.moveStep2, chaserCancelledSteps, chaserBlocked)
  const newChaserPos = chaserPath.length > 0 ? chaserPath[chaserPath.length - 1] : chaserPos

  // Move evader with their cancelled steps applied, blocked by chaser's new position
  const evaderBlocked = new Set([...baseBlocked, `${newChaserPos.q},${newChaserPos.r}`])
  const evaderPath = executePath(evaderPos, p2Plan.moveStep1, p2Plan.moveStep2, evaderCancelledSteps, evaderBlocked)
  const newEvaderPos = evaderPath.length > 0 ? evaderPath[evaderPath.length - 1] : evaderPos

  const resolution: ResolutionSummary = {
    chaserPredQuality: qualityFromMatches(evaderCancelledSteps),
    evaderPredQuality: qualityFromMatches(chaserCancelledSteps),
    chaserCancelledSteps,
    evaderCancelledSteps,
  }

  // Win conditions
  const chaserCatches = hexDistance(newChaserPos.q, newChaserPos.r, newEvaderPos.q, newEvaderPos.r) <= 1
  const evaderSurvives = !chaserCatches && turn >= MAX_TURNS
  const winner = chaserCatches ? 'chaser' : evaderSurvives ? 'evader' : null

  return {
    ...state,
    chaserPos: newChaserPos,
    evaderPos: newEvaderPos,
    prevChaserPath: chaserPath.length > 0 ? [chaserPos, ...chaserPath] : null,
    prevEvaderPath: evaderPath.length > 0 ? [evaderPos, ...evaderPath] : null,
    turn: turn + 1,
    winner,
    p1Plan: null,
    p2Plan: null,
    lastResolution: resolution,
  }
}
