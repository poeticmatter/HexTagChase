import type { HexCoord, WallCoord, GameState, TurnPlan, PredictionQuality, ResolutionSummary, GameSettings } from '../types'
import {
  HEX_RADIUS, hexDistance, isOnBoard, HEX_DIRECTIONS, getAllHexes,
  isOnAnyBoard, getDirections, getAllCells, cellDistance, SQUARE_RADIUS,
} from './hexGrid'

export const MAX_TURNS = 20
export const TOKENS_NEEDED = 4

// ── Collectible token positions ─────────────────────────────────────────────
// Fixed positions closer to the chaser spawn (-3,0) than the evader spawn (3,0).
// Spread across the chaser's half so the chaser faces a defender-vs-pursuer dilemma.
export const COLLECTIBLE_TOKENS: HexCoord[] = [
  { q:  1, r: -2 },
  { q:  0, r: -4 },
  { q: -3, r:  4 },
  { q: -1, r:  1 },
  { q: -4, r:  2 },
  { q: -2, r: -1 },
]

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

const SQUARE_DIAGONAL_OFFSETS = [
  { dq: 1, dr: 1 }, { dq: 1, dr: -1 },
  { dq: -1, dr: 1 }, { dq: -1, dr: -1 },
]

function wouldTouchDiagonally(hex: HexCoord, placed: Set<string>): boolean {
  return SQUARE_DIAGONAL_OFFSETS.some(({ dq, dr }) => placed.has(`${hex.q + dq},${hex.r + dr}`))
}

function wouldMakeClusterOfThree(
  hex: HexCoord,
  placed: Set<string>,
  directions: Record<number, { dq: number; dr: number }>,
): boolean {
  const obstacleNeighbors = Object.values(directions)
    .map(({ dq, dr }) => ({ q: hex.q + dq, r: hex.r + dr }))
    .filter(n => placed.has(`${n.q},${n.r}`))

  if (obstacleNeighbors.length >= 2) return true

  if (obstacleNeighbors.length === 1) {
    const neighbor = obstacleNeighbors[0]
    const neighborObstacleNeighborCount = Object.values(directions)
      .map(({ dq, dr }) => ({ q: neighbor.q + dq, r: neighbor.r + dr }))
      .filter(n => placed.has(`${n.q},${n.r}`) && !(n.q === hex.q && n.r === hex.r))
      .length
    if (neighborObstacleNeighborCount >= 1) return true
  }

  return false
}

export function generateObstacles(
  chaserPos: HexCoord,
  evaderPos: HexCoord,
  gridType: 'hex' | 'square' = 'hex',
  reservedCells: HexCoord[] = [],
): HexCoord[] {
  const allCells = getAllCells(gridType)
  const directions = getDirections(gridType)
  const radius = gridType === 'square' ? SQUARE_RADIUS : HEX_RADIUS
  const reservedKeys = new Set(reservedCells.map(({ q, r }) => `${q},${r}`))

  const candidates = allCells.filter(({ q, r }) => {
    // For square grids use Chebyshev distance so only the literal perimeter row/column
    // is excluded, rather than the much larger Manhattan "diamond" region.
    const notOnPerimeter = gridType === 'square'
      ? Math.max(Math.abs(q), Math.abs(r)) < SQUARE_RADIUS
      : cellDistance(0, 0, q, r, gridType) < radius
    const clearOfChaser = cellDistance(q, r, chaserPos.q, chaserPos.r, gridType) > 2
    const clearOfEvader = cellDistance(q, r, evaderPos.q, evaderPos.r, gridType) > 2
    const clearOfReserved = !reservedKeys.has(`${q},${r}`)
    return notOnPerimeter && clearOfChaser && clearOfEvader && clearOfReserved
  })

  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const target = Math.round(allCells.length / 6)
  const placed = new Set<string>()
  const result: HexCoord[] = []

  for (const hex of candidates) {
    if (result.length >= target) break
    if (wouldMakeClusterOfThree(hex, placed, directions)) continue
    if (gridType === 'square' && wouldTouchDiagonally(hex, placed)) continue
    placed.add(`${hex.q},${hex.r}`)
    result.push(hex)
  }

  return result
}

// ── Wall helpers ──────────────────────────────────────────────────────────

/** Builds a directional lookup set from a list of walls. Both directions are stored. */
export function buildWallSet(walls: WallCoord[]): Set<string> {
  const set = new Set<string>()
  for (const { q1, r1, q2, r2 } of walls) {
    set.add(`${q1},${r1}>${q2},${r2}`)
    set.add(`${q2},${r2}>${q1},${r1}`)
  }
  return set
}

function isPassable(from: HexCoord, to: HexCoord, wallSet: Set<string>): boolean {
  return !wallSet.has(`${from.q},${from.r}>${to.q},${to.r}`)
}

function isConnectedThrough(
  from: HexCoord,
  to: HexCoord,
  obstacleKeys: Set<string>,
  wallSet: Set<string>,
  gridType: 'hex' | 'square',
): boolean {
  const toKey = `${to.q},${to.r}`
  const visited = new Set<string>()
  const queue: string[] = [`${from.q},${from.r}`]
  const directions = getDirections(gridType)

  while (queue.length > 0) {
    const key = queue.pop()!
    if (key === toKey) return true
    if (visited.has(key)) continue
    visited.add(key)
    const [q, r] = key.split(',').map(Number)
    for (const { dq, dr } of Object.values(directions)) {
      const nq = q + dq
      const nr = r + dr
      const nk = `${nq},${nr}`
      if (!isOnAnyBoard(nq, nr, gridType)) continue
      if (obstacleKeys.has(nk)) continue
      if (wallSet.has(`${key}>${nk}`)) continue
      if (!visited.has(nk)) queue.push(nk)
    }
  }
  return false
}

// ── Wall section helpers ──────────────────────────────────────────────────

function canonicalEdgeKey(q1: number, r1: number, q2: number, r2: number): string {
  const k1 = `${q1},${r1}`
  const k2 = `${q2},${r2}`
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
}

function normalizeWall(q1: number, r1: number, q2: number, r2: number): WallCoord {
  const k1 = `${q1},${r1}`
  const k2 = `${q2},${r2}`
  return k1 < k2 ? { q1, r1, q2, r2 } : { q1: q2, r1: r2, q2: q1, r2: r1 }
}

/**
 * Returns the 4 edges that share a vertex with the given edge.
 * In a hex grid, two vertices of each edge each have 3 edges meeting at them.
 * The algorithm: for edge A→B in direction d, the "third hexes" at each vertex are
 * A+prev(d) and A+next(d) (the immediate clockwise/counterclockwise neighbors of d).
 * Each vertex then contributes two additional edges to the adjacency set.
 */
function getEdgeAdjacentEdges(wall: WallCoord, gridType: 'hex' | 'square'): WallCoord[] {
  const { q1, r1, q2, r2 } = wall
  const dq = q2 - q1
  const dr = r2 - r1
  const dirs = Object.values(getDirections(gridType))

  const dirIdx = dirs.findIndex(d => d.dq === dq && d.dr === dr)
  if (dirIdx < 0) return []

  const n = dirs.length
  const prev = dirs[(dirIdx - 1 + n) % n]
  const next = dirs[(dirIdx + 1) % n]

  // Two "third hexes" — one per vertex of this edge
  const C1 = { q: q1 + prev.dq, r: r1 + prev.dr }
  const C2 = { q: q1 + next.dq, r: r1 + next.dr }
  const A  = { q: q1, r: r1 }
  const B  = { q: q2, r: r2 }

  const result: WallCoord[] = []
  for (const [from, to] of [[A, C1], [B, C1], [A, C2], [B, C2]] as [HexCoord, HexCoord][]) {
    if (!isOnAnyBoard(to.q, to.r, gridType) || !isOnAnyBoard(from.q, from.r, gridType)) continue
    // Confirm it's a real adjacent edge (one hex step apart)
    const edq = to.q - from.q
    const edr = to.r - from.r
    if (!dirs.some(d => d.dq === edq && d.dr === edr)) continue
    result.push(normalizeWall(from.q, from.r, to.q, to.r))
  }
  return result
}

/**
 * Returns true if adding `wall` to `existingWallSet` would give either bordering hex
 * three or more consecutive walled edges (out of its 6 clockwise edges).
 * existingWallSet is a directional set and does NOT yet include `wall`.
 */
function wouldCreateThreeConsecutiveWalls(
  wall: WallCoord,
  existingWallSet: Set<string>,
  gridType: 'hex' | 'square',
): boolean {
  const dirs = Object.values(getDirections(gridType))
  const n = dirs.length

  for (const [q, r] of [[wall.q1, wall.r1], [wall.q2, wall.r2]] as [number, number][]) {
    const hasWall = dirs.map(({ dq, dr }) => {
      const nq = q + dq
      const nr = r + dr
      const isNewWall =
        (wall.q1 === q && wall.r1 === r && wall.q2 === nq && wall.r2 === nr) ||
        (wall.q2 === q && wall.r2 === r && wall.q1 === nq && wall.r1 === nr)
      return existingWallSet.has(`${q},${r}>${nq},${nr}`) || isNewWall
    })

    for (let i = 0; i < n; i++) {
      if (hasWall[i] && hasWall[(i + 1) % n] && hasWall[(i + 2) % n]) return true
    }
  }
  return false
}

/**
 * Grows a connected wall section starting from startEdge.
 * At each step, randomly picks any edge adjacent (vertex-sharing) to the current section,
 * allowing the section to branch. Stops at targetLen or when no candidates remain.
 * activeWallSet is the directional set of all already-placed walls (updated externally
 * after each accepted section), used to enforce the consecutive-edges constraint.
 */
function growWallSection(
  startEdge: WallCoord,
  targetLen: number,
  availableKeys: Set<string>,
  activeWallSet: Set<string>,
  gridType: 'hex' | 'square',
): WallCoord[] {
  const section: WallCoord[] = [startEdge]
  const sectionKeys = new Set<string>([canonicalEdgeKey(startEdge.q1, startEdge.r1, startEdge.q2, startEdge.r2)])

  // Track walls from this section incrementally so the consecutive check sees them
  const sectionWallSet = new Set(activeWallSet)
  sectionWallSet.add(`${startEdge.q1},${startEdge.r1}>${startEdge.q2},${startEdge.r2}`)
  sectionWallSet.add(`${startEdge.q2},${startEdge.r2}>${startEdge.q1},${startEdge.r1}`)

  for (let i = 1; i < targetLen; i++) {
    const candidates: WallCoord[] = []
    const seen = new Set<string>()

    for (const edge of section) {
      for (const adj of getEdgeAdjacentEdges(edge, gridType)) {
        const k = canonicalEdgeKey(adj.q1, adj.r1, adj.q2, adj.r2)
        if (!sectionKeys.has(k) && availableKeys.has(k) && !seen.has(k)
            && !wouldCreateThreeConsecutiveWalls(adj, sectionWallSet, gridType)) {
          candidates.push(adj)
          seen.add(k)
        }
      }
    }

    if (candidates.length === 0) break
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    section.push(pick)
    sectionKeys.add(canonicalEdgeKey(pick.q1, pick.r1, pick.q2, pick.r2))
    sectionWallSet.add(`${pick.q1},${pick.r1}>${pick.q2},${pick.r2}`)
    sectionWallSet.add(`${pick.q2},${pick.r2}>${pick.q1},${pick.r1}`)
  }

  return section
}

/**
 * Generates wall sections — connected groups of 4–6 edge segments.
 * sectionCount: 4 in walls-only mode, 2 in both mode.
 * In both mode (existingObstacles non-empty), walls are allowed to touch obstacle cells.
 */
export function generateWalls(
  chaserPos: HexCoord,
  evaderPos: HexCoord,
  existingObstacles: HexCoord[],
  gridType: 'hex' | 'square' = 'hex',
  sectionCount: number = 4,
): WallCoord[] {
  const allCells = getAllCells(gridType)
  const obstacleKeys = new Set(existingObstacles.map(({ q, r }) => `${q},${r}`))

  // Build pool of all valid candidate edges.
  // Both cells must be on-board. Skip if both cells are obstacles (wall between two blocked cells
  // has no gameplay effect). Spawn clearance applied to both endpoints.
  const candidatePool: WallCoord[] = []
  const seen = new Set<string>()

  for (const { q, r } of allCells) {
    for (const { dq, dr } of Object.values(getDirections(gridType))) {
      const q2 = q + dq
      const r2 = r + dr
      if (!isOnAnyBoard(q2, r2, gridType)) continue
      if (obstacleKeys.has(`${q},${r}`) && obstacleKeys.has(`${q2},${r2}`)) continue

      const k = canonicalEdgeKey(q, r, q2, r2)
      if (seen.has(k)) continue
      seen.add(k)

      const clearOfChaser = cellDistance(q, r, chaserPos.q, chaserPos.r, gridType) > 2
        && cellDistance(q2, r2, chaserPos.q, chaserPos.r, gridType) > 2
      const clearOfEvader = cellDistance(q, r, evaderPos.q, evaderPos.r, gridType) > 2
        && cellDistance(q2, r2, evaderPos.q, evaderPos.r, gridType) > 2
      if (!clearOfChaser || !clearOfEvader) continue

      candidatePool.push(normalizeWall(q, r, q2, r2))
    }
  }

  // Shuffle for random section placement
  for (let i = candidatePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]]
  }

  const availableKeys = new Set(candidatePool.map(w => canonicalEdgeKey(w.q1, w.r1, w.q2, w.r2)))
  const result: WallCoord[] = []
  const placedWallSet = new Set<string>()
  let sectionsPlaced = 0

  for (const startEdge of candidatePool) {
    if (sectionsPlaced >= sectionCount) break
    if (!availableKeys.has(canonicalEdgeKey(startEdge.q1, startEdge.r1, startEdge.q2, startEdge.r2))) continue

    if (wouldCreateThreeConsecutiveWalls(startEdge, placedWallSet, gridType)) continue

    const targetLen = Math.floor(Math.random() * 3) + 4  // 4, 5, or 6 segments
    const section = growWallSection(startEdge, targetLen, availableKeys, placedWallSet, gridType)
    if (section.length < 4) continue

    // Verify chaser and evader remain connected with all placed walls so far plus this section
    const testSet = new Set(placedWallSet)
    for (const { q1, r1, q2, r2 } of section) {
      testSet.add(`${q1},${r1}>${q2},${r2}`)
      testSet.add(`${q2},${r2}>${q1},${r1}`)
    }
    if (!isConnectedThrough(chaserPos, evaderPos, obstacleKeys, testSet, gridType)) continue

    // Accept section: commit walls and remove from available pool
    for (const w of section) {
      const k = canonicalEdgeKey(w.q1, w.r1, w.q2, w.r2)
      availableKeys.delete(k)
      placedWallSet.add(`${w.q1},${w.r1}>${w.q2},${w.r2}`)
      placedWallSet.add(`${w.q2},${w.r2}>${w.q1},${w.r1}`)
      result.push(w)
    }
    sectionsPlaced++
  }

  return result
}

// ── Neighbors ─────────────────────────────────────────────────────────────

/** All valid (on-board, non-obstacle, non-walled) neighbors of a cell. */
export function validNeighbors(
  pos: HexCoord,
  blocked: Set<string>,
  gridType: 'hex' | 'square' = 'hex',
  walls: Set<string> = new Set(),
): HexCoord[] {
  const directions = getDirections(gridType)
  return Object.values(directions)
    .map(({ dq, dr }) => ({ q: pos.q + dq, r: pos.r + dr }))
    .filter(({ q, r }) =>
      isOnAnyBoard(q, r, gridType)
      && !blocked.has(`${q},${r}`)
      && isPassable(pos, { q, r }, walls),
    )
}

/** All cells reachable from pos in 1 or 2 steps (respects moveSteps). Excludes pos itself. */
export function reachableDestinations(
  pos: HexCoord,
  blocked: Set<string>,
  gridType: 'hex' | 'square' = 'hex',
  moveSteps: 1 | 2 = 2,
  walls: Set<string> = new Set(),
): HexCoord[] {
  const step1Cells = validNeighbors(pos, blocked, gridType, walls)
  if (moveSteps === 1) return step1Cells
  const startKey = `${pos.q},${pos.r}`
  const reached = new Set<string>(step1Cells.map(h => `${h.q},${h.r}`))
  const result = [...step1Cells]
  for (const mid of step1Cells) {
    for (const h of validNeighbors(mid, blocked, gridType, walls)) {
      const key = `${h.q},${h.r}`
      if (key !== startKey && !reached.has(key)) {
        reached.add(key)
        result.push(h)
      }
    }
  }
  return result
}

/** Direction index between two adjacent cells, or null if not adjacent. */
function directionBetween(
  from: HexCoord,
  to: HexCoord,
  directions: Record<number, { dq: number; dr: number }>,
): number | null {
  const dq = to.q - from.q
  const dr = to.r - from.r
  for (const [idx, dir] of Object.entries(directions)) {
    if (dir.dq === dq && dir.dr === dr) return Number(idx)
  }
  return null
}

// ── Prediction assessment ─────────────────────────────────────────────────

/**
 * For each planned step, determine whether the prediction cancels it.
 * In 'direction' mode: checks if the predicted direction matches the actual direction.
 * In 'destination' mode: checks if the predicted destination matches the actual destination.
 * Returns [step1Matched, step2Matched].
 */
function matchedSteps(
  start: HexCoord,
  actualStep1: HexCoord,
  actualStep2: HexCoord | undefined,
  predictedStep1: HexCoord,
  predictedStep2: HexCoord | undefined,
  settings: GameSettings,
): [boolean, boolean] {
  const hasStep2 = settings.moveSteps === 2 && actualStep2 !== undefined && predictedStep2 !== undefined

  if (settings.predictionTarget === 'destination') {
    const match1 = actualStep1.q === predictedStep1.q && actualStep1.r === predictedStep1.r
    const match2 = hasStep2
      ? actualStep2!.q === predictedStep2!.q && actualStep2!.r === predictedStep2!.r
      : false
    return [match1, match2]
  }

  // Direction matching
  const directions = getDirections(settings.gridType)
  const actualDir1 = directionBetween(start, actualStep1, directions)
  const predDir1   = directionBetween(start, predictedStep1, directions)
  const match1 = actualDir1 !== null && predDir1 !== null && actualDir1 === predDir1

  let match2 = false
  if (hasStep2) {
    const actualDir2 = directionBetween(actualStep1, actualStep2!, directions)
    const predDir2   = directionBetween(predictedStep1, predictedStep2!, directions)
    match2 = actualDir2 !== null && predDir2 !== null && actualDir2 === predDir2
  }

  return [match1, match2]
}

function qualityFromMatches(
  cancelled: [boolean, boolean],
  moveSteps: 1 | 2 = 2,
  predictionTarget: 'direction' | 'destination' = 'direction',
): PredictionQuality {
  if (moveSteps === 1 || predictionTarget === 'destination') return cancelled[0] ? 'full' : 'none'
  const count = (cancelled[0] ? 1 : 0) + (cancelled[1] ? 1 : 0)
  if (count === 2) return 'full'
  if (count === 1) return 'partial'
  return 'none'
}

// ── Movement ──────────────────────────────────────────────────────────────

/**
 * Finds a valid intermediate cell between start and a 2-step-away destination.
 * Returns the first unblocked neighbor of start that is also a neighbor of destination.
 */
function findIntermediateCell(
  start: HexCoord,
  destination: HexCoord,
  blocked: Set<string>,
  gridType: 'hex' | 'square',
  walls: Set<string> = new Set(),
): HexCoord | null {
  const directions = getDirections(gridType)
  for (const { dq, dr } of Object.values(directions)) {
    const mid = { q: start.q + dq, r: start.r + dr }
    if (!isOnAnyBoard(mid.q, mid.r, gridType)) continue
    if (blocked.has(`${mid.q},${mid.r}`)) continue
    if (!isPassable(start, mid, walls)) continue
    const destIsAdjacentToMid = Object.values(directions).some(
      ({ dq: dq2, dr: dr2 }) => {
        const dest2 = { q: mid.q + dq2, r: mid.r + dr2 }
        return dest2.q === destination.q && dest2.r === destination.r
          && isPassable(mid, destination, walls)
      },
    )
    if (destIsAdjacentToMid) return mid
  }
  return null
}

function stepOne(
  pos: HexCoord,
  dirIndex: number,
  blocked: Set<string>,
  gridType: 'hex' | 'square' = 'hex',
  walls: Set<string> = new Set(),
): HexCoord {
  const directions = getDirections(gridType)
  const dir = directions[dirIndex]
  if (!dir) return pos
  const nq = pos.q + dir.dq
  const nr = pos.r + dir.dr
  const next = { q: nq, r: nr }
  if (!isOnAnyBoard(nq, nr, gridType) || blocked.has(`${nq},${nr}`) || !isPassable(pos, next, walls)) return pos
  return next
}

/**
 * Execute a planned path with per-step cancellation.
 * Cancelled steps are skipped; remaining steps still execute.
 * In destination mode, step1Target may be 2 steps away — an intermediate cell is found automatically.
 * Returns the sequence of positions actually visited (0–2 entries, 0–1 in 1-step mode).
 */
function executePath(
  startPos: HexCoord,
  step1Target: HexCoord,
  step2Target: HexCoord | undefined,
  cancelled: [boolean, boolean],
  blocked: Set<string>,
  gridType: 'hex' | 'square' = 'hex',
  predictionTarget: 'direction' | 'destination' = 'direction',
  walls: Set<string> = new Set(),
): HexCoord[] {
  const directions = getDirections(gridType)
  const dir1 = directionBetween(startPos, step1Target, directions)
  const dir2 = step2Target ? directionBetween(step1Target, step2Target, directions) : null

  const visited: HexCoord[] = []
  let pos = startPos

  if (!cancelled[0]) {
    if (dir1 !== null) {
      pos = stepOne(pos, dir1, blocked, gridType, walls)
      visited.push(pos)
    } else if (predictionTarget === 'destination') {
      // Destination is 2 steps away — find an intermediate cell and take both steps
      const mid = findIntermediateCell(pos, step1Target, blocked, gridType, walls)
      if (mid) {
        visited.push(mid)
        pos = mid
        const dirToDestination = directionBetween(pos, step1Target, directions)
        if (dirToDestination !== null) {
          pos = stepOne(pos, dirToDestination, blocked, gridType, walls)
          visited.push(pos)
        }
      }
    }
  }

  if (!cancelled[1] && dir2 !== null) {
    pos = stepOne(pos, dir2, blocked, gridType, walls)
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
  const { predictionOutcome } = state.settings
  if (predictionOutcome === 'freeze-and-bonus') return resolveRoundFreezeAndBonus(state, p1Plan, p2Plan)
  if (predictionOutcome === 'bonus-both')       return resolveRoundBonusBoth(state, p1Plan, p2Plan)
  return resolveRoundFreezeBoth(state, p1Plan, p2Plan)
}

function resolveRoundFreezeBoth(
  state: GameState,
  p1Plan: TurnPlan,
  p2Plan: TurnPlan,
): GameState {
  const { chaserPos, evaderPos, obstacles, walls, turn, settings } = state
  const { gridType, moveSteps } = settings
  const baseBlocked = obstacleSet(obstacles)
  const baseWalls = buildWallSet(walls)

  // Each player's prediction cancels the corresponding steps of the opponent
  const chaserCancelledSteps = matchedSteps(
    chaserPos, p1Plan.moveStep1, p1Plan.moveStep2,
    p2Plan.predictStep1, p2Plan.predictStep2,
    settings,
  )
  const evaderCancelledSteps = matchedSteps(
    evaderPos, p2Plan.moveStep1, p2Plan.moveStep2,
    p1Plan.predictStep1, p1Plan.predictStep2,
    settings,
  )

  const { predictionTarget } = settings
  // Both paths computed with only obstacles — no opponent blocking (simultaneous movement)
  const chaserPath = executePath(chaserPos, p1Plan.moveStep1, p1Plan.moveStep2, chaserCancelledSteps, baseBlocked, gridType, predictionTarget, baseWalls)
  const evaderPath = executePath(evaderPos, p2Plan.moveStep1, p2Plan.moveStep2, evaderCancelledSteps, baseBlocked, gridType, predictionTarget, baseWalls)
  const newChaserPos = chaserPath.length > 0 ? chaserPath[chaserPath.length - 1] : chaserPos
  const newEvaderPos = evaderPath.length > 0 ? evaderPath[evaderPath.length - 1] : evaderPos

  const resolution: ResolutionSummary = {
    chaserPredQuality: qualityFromMatches(evaderCancelledSteps, moveSteps, predictionTarget),
    evaderPredQuality: qualityFromMatches(chaserCancelledSteps, moveSteps, predictionTarget),
    chaserCancelledSteps,
    evaderCancelledSteps,
  }

  return buildNextState(state, newChaserPos, newEvaderPos, chaserPath, evaderPath, resolution)
}

function resolveRoundFreezeAndBonus(
  state: GameState,
  p1Plan: TurnPlan,
  p2Plan: TurnPlan,
): GameState {
  const { chaserPos, evaderPos, obstacles, walls, settings } = state
  const { gridType, moveSteps } = settings
  const baseBlocked = obstacleSet(obstacles)
  const baseWalls = buildWallSet(walls)
  const directions = getDirections(gridType)

  // Chaser prediction cancels evader steps
  const evaderCancelledSteps = matchedSteps(
    evaderPos, p2Plan.moveStep1, p2Plan.moveStep2,
    p1Plan.predictStep1, p1Plan.predictStep2,
    settings,
  )

  // Evader prediction does NOT cancel chaser steps; instead unlocks bonus move
  const evaderPredMatches = matchedSteps(
    chaserPos, p1Plan.moveStep1, p1Plan.moveStep2,
    p2Plan.predictStep1, p2Plan.predictStep2,
    settings,
  )
  const evaderPredHit = evaderPredMatches[0] || evaderPredMatches[1]
  const chaserCancelledSteps: [boolean, boolean] = [false, false]

  const { predictionTarget } = settings
  // Both paths computed with only obstacles — no opponent blocking (simultaneous movement)
  const chaserPath = executePath(chaserPos, p1Plan.moveStep1, p1Plan.moveStep2, chaserCancelledSteps, baseBlocked, gridType, predictionTarget, baseWalls)
  const evaderPath = executePath(evaderPos, p2Plan.moveStep1, p2Plan.moveStep2, evaderCancelledSteps, baseBlocked, gridType, predictionTarget, baseWalls)
  const newChaserPos = chaserPath.length > 0 ? chaserPath[chaserPath.length - 1] : chaserPos
  let newEvaderPos = evaderPath.length > 0 ? evaderPath[evaderPath.length - 1] : evaderPos

  // Bonus move: if evader predicted correctly and pre-committed a bonus move
  let evaderBonusUsed = false
  if (evaderPredHit && p2Plan.bonusMove) {
    const planEndPos = p2Plan.moveStep2 ?? p2Plan.moveStep1
    const bonusDir = directionBetween(planEndPos, p2Plan.bonusMove, directions)
    if (bonusDir !== null) {
      const bonusPos = stepOne(newEvaderPos, bonusDir, baseBlocked, gridType, baseWalls)
      if (bonusPos.q !== newEvaderPos.q || bonusPos.r !== newEvaderPos.r) {
        evaderPath.push(bonusPos)
        newEvaderPos = bonusPos
        evaderBonusUsed = true
      }
    }
  }

  const resolution: ResolutionSummary = {
    chaserPredQuality: qualityFromMatches(evaderCancelledSteps, moveSteps, predictionTarget),
    evaderPredQuality: qualityFromMatches(evaderPredMatches, moveSteps, predictionTarget),
    chaserCancelledSteps,
    evaderCancelledSteps,
    evaderBonusUsed,
  }

  return buildNextState(state, newChaserPos, newEvaderPos, chaserPath, evaderPath, resolution)
}

function resolveRoundBonusBoth(
  state: GameState,
  p1Plan: TurnPlan,
  p2Plan: TurnPlan,
): GameState {
  const { chaserPos, evaderPos, obstacles, walls, settings } = state
  const { gridType, moveSteps } = settings
  const baseBlocked = obstacleSet(obstacles)
  const baseWalls = buildWallSet(walls)
  const directions = getDirections(gridType)

  // Neither player's prediction cancels opponent steps; both unlock their own bonus move
  const chaserCancelledSteps: [boolean, boolean] = [false, false]
  const evaderCancelledSteps: [boolean, boolean] = [false, false]

  const chaserPredMatches = matchedSteps(
    evaderPos, p2Plan.moveStep1, p2Plan.moveStep2,
    p1Plan.predictStep1, p1Plan.predictStep2,
    settings,
  )
  const evaderPredMatches = matchedSteps(
    chaserPos, p1Plan.moveStep1, p1Plan.moveStep2,
    p2Plan.predictStep1, p2Plan.predictStep2,
    settings,
  )
  const chaserPredHit = chaserPredMatches[0] || chaserPredMatches[1]
  const evaderPredHit = evaderPredMatches[0] || evaderPredMatches[1]

  const { predictionTarget } = settings
  // Both paths computed with only obstacles — no opponent blocking (simultaneous movement)
  const chaserPath = executePath(chaserPos, p1Plan.moveStep1, p1Plan.moveStep2, chaserCancelledSteps, baseBlocked, gridType, predictionTarget, baseWalls)
  const evaderPath = executePath(evaderPos, p2Plan.moveStep1, p2Plan.moveStep2, evaderCancelledSteps, baseBlocked, gridType, predictionTarget, baseWalls)
  let newChaserPos = chaserPath.length > 0 ? chaserPath[chaserPath.length - 1] : chaserPos
  let newEvaderPos = evaderPath.length > 0 ? evaderPath[evaderPath.length - 1] : evaderPos

  // Both bonus moves computed simultaneously with only obstacles blocked
  let chaserBonusUsed = false
  if (chaserPredHit && p1Plan.bonusMove) {
    const planEndPos = p1Plan.moveStep2 ?? p1Plan.moveStep1
    const bonusDir = directionBetween(planEndPos, p1Plan.bonusMove, directions)
    if (bonusDir !== null) {
      const bonusPos = stepOne(newChaserPos, bonusDir, baseBlocked, gridType, baseWalls)
      if (bonusPos.q !== newChaserPos.q || bonusPos.r !== newChaserPos.r) {
        chaserPath.push(bonusPos)
        newChaserPos = bonusPos
        chaserBonusUsed = true
      }
    }
  }

  let evaderBonusUsed = false
  if (evaderPredHit && p2Plan.bonusMove) {
    const planEndPos = p2Plan.moveStep2 ?? p2Plan.moveStep1
    const bonusDir = directionBetween(planEndPos, p2Plan.bonusMove, directions)
    if (bonusDir !== null) {
      const bonusPos = stepOne(newEvaderPos, bonusDir, baseBlocked, gridType, baseWalls)
      if (bonusPos.q !== newEvaderPos.q || bonusPos.r !== newEvaderPos.r) {
        evaderPath.push(bonusPos)
        newEvaderPos = bonusPos
        evaderBonusUsed = true
      }
    }
  }

  const resolution: ResolutionSummary = {
    chaserPredQuality: qualityFromMatches(chaserPredMatches, moveSteps, predictionTarget),
    evaderPredQuality: qualityFromMatches(evaderPredMatches, moveSteps, predictionTarget),
    chaserCancelledSteps,
    evaderCancelledSteps,
    chaserBonusUsed,
    evaderBonusUsed,
  }

  return buildNextState(state, newChaserPos, newEvaderPos, chaserPath, evaderPath, resolution)
}

function buildNextState(
  state: GameState,
  newChaserPos: HexCoord,
  newEvaderPos: HexCoord,
  chaserPath: HexCoord[],
  evaderPath: HexCoord[],
  resolution: ResolutionSummary,
): GameState {
  const { chaserPos, evaderPos, turn, settings, collectibleTokens, tokensCollected } = state

  // Always check for same-cell collision during movement (simultaneous step-by-step)
  let finalChaserPos = newChaserPos
  let finalEvaderPos = newEvaderPos
  let finalChaserPath = chaserPath
  let finalEvaderPath = evaderPath

  const midCollision = findMidCollision(chaserPos, evaderPos, chaserPath, evaderPath, settings.gridType)
  if (midCollision !== null) {
    finalChaserPos = midCollision.chaserPos
    finalEvaderPos = midCollision.evaderPos
    finalChaserPath = chaserPath.slice(0, midCollision.step)
    finalEvaderPath = evaderPath.slice(0, midCollision.step)
  }

  // End-of-turn adjacency check always applies
  const chaserCatches = cellDistance(finalChaserPos.q, finalChaserPos.r, finalEvaderPos.q, finalEvaderPos.r, settings.gridType) <= 1

  // Token collection: evader picks up a token at their final position (only if not caught)
  let nextTokens = collectibleTokens
  let nextTokensCollected = tokensCollected
  if (!chaserCatches && settings.evaderObjective === 'collect') {
    const evaderKey = `${finalEvaderPos.q},${finalEvaderPos.r}`
    const tokenIndex = collectibleTokens.findIndex(t => `${t.q},${t.r}` === evaderKey)
    if (tokenIndex !== -1) {
      nextTokens = collectibleTokens.filter((_, i) => i !== tokenIndex)
      nextTokensCollected = tokensCollected + 1
    }
  }

  // Win condition
  const evaderCollected = settings.evaderObjective === 'collect' && nextTokensCollected >= TOKENS_NEEDED
  const evaderSurvived = settings.evaderObjective === 'survive' && !chaserCatches && turn >= settings.maxTurns
  const winner = chaserCatches ? 'chaser' : (evaderCollected || evaderSurvived) ? 'evader' : null

  return {
    ...state,
    chaserPos: finalChaserPos,
    evaderPos: finalEvaderPos,
    prevChaserPath: finalChaserPath.length > 0 ? [chaserPos, ...finalChaserPath] : null,
    prevEvaderPath: finalEvaderPath.length > 0 ? [evaderPos, ...finalEvaderPath] : null,
    turn: turn + 1,
    winner,
    p1Plan: null,
    p2Plan: null,
    lastResolution: resolution,
    collectibleTokens: nextTokens,
    tokensCollected: nextTokensCollected,
  }
}

/**
 * Steps both paths simultaneously and returns the first step where players occupy the same cell,
 * or null if no collision occurs. Players hold their last position once their path is exhausted.
 */
function findMidCollision(
  chaserStart: HexCoord,
  evaderStart: HexCoord,
  chaserPath: HexCoord[],
  evaderPath: HexCoord[],
  gridType: 'hex' | 'square',
): { step: number; chaserPos: HexCoord; evaderPos: HexCoord } | null {
  const totalSteps = Math.max(chaserPath.length, evaderPath.length)
  let cp = chaserStart
  let ep = evaderStart

  for (let i = 0; i < totalSteps; i++) {
    cp = chaserPath[i] ?? cp
    ep = evaderPath[i] ?? ep
    if (cellDistance(cp.q, cp.r, ep.q, ep.r, gridType) === 0) {
      return { step: i + 1, chaserPos: cp, evaderPos: ep }
    }
  }

  return null
}
