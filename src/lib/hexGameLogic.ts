import type { HexCoord, WallCoord, GameState, TurnPlan, ResolutionSummary } from '../types'
import { MAX_TURNS } from '../types'
import {
  HEX_RADIUS, hexDistance, isOnBoard, HEX_DIRECTIONS, getAllHexes,
} from './hexGrid'

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

function wouldMakeClusterOfThree(
  hex: HexCoord,
  placed: Set<string>,
): boolean {
  const obstacleNeighbors = Object.values(HEX_DIRECTIONS)
    .map(({ dq, dr }) => ({ q: hex.q + dq, r: hex.r + dr }))
    .filter(n => placed.has(`${n.q},${n.r}`))

  if (obstacleNeighbors.length >= 2) return true

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

export function generateObstacles(
  chaserPos: HexCoord,
  evaderPos: HexCoord,
): HexCoord[] {
  const allCells = getAllHexes()

  const candidates = allCells.filter(({ q, r }) => {
    const notOnPerimeter = hexDistance(0, 0, q, r) < HEX_RADIUS
    const clearOfChaser = hexDistance(q, r, chaserPos.q, chaserPos.r) > 2
    const clearOfEvader = hexDistance(q, r, evaderPos.q, evaderPos.r) > 2
    return notOnPerimeter && clearOfChaser && clearOfEvader
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
    if (wouldMakeClusterOfThree(hex, placed)) continue
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
): boolean {
  const toKey = `${to.q},${to.r}`
  const visited = new Set<string>()
  const queue: string[] = [`${from.q},${from.r}`]

  while (queue.length > 0) {
    const key = queue.pop()!
    if (key === toKey) return true
    if (visited.has(key)) continue
    visited.add(key)
    const [q, r] = key.split(',').map(Number)
    for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
      const nq = q + dq
      const nr = r + dr
      const nk = `${nq},${nr}`
      if (!isOnBoard(nq, nr)) continue
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
function getEdgeAdjacentEdges(wall: WallCoord): WallCoord[] {
  const { q1, r1, q2, r2 } = wall
  const dq = q2 - q1
  const dr = r2 - r1
  const dirs = Object.values(HEX_DIRECTIONS)

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
    if (!isOnBoard(to.q, to.r) || !isOnBoard(from.q, from.r)) continue
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
): boolean {
  const dirs = Object.values(HEX_DIRECTIONS)
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
      for (const adj of getEdgeAdjacentEdges(edge)) {
        const k = canonicalEdgeKey(adj.q1, adj.r1, adj.q2, adj.r2)
        if (!sectionKeys.has(k) && availableKeys.has(k) && !seen.has(k)
            && !wouldCreateThreeConsecutiveWalls(adj, sectionWallSet)) {
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
 * sectionCount is hardcoded to 2 for 'both' mode.
 */
export function generateWalls(
  chaserPos: HexCoord,
  evaderPos: HexCoord,
  existingObstacles: HexCoord[],
): WallCoord[] {
  const allCells = getAllHexes()
  const obstacleKeys = new Set(existingObstacles.map(({ q, r }) => `${q},${r}`))

  // Build pool of all valid candidate edges.
  // Both cells must be on-board. Skip if both cells are obstacles (wall between two blocked cells
  // has no gameplay effect). Spawn clearance applied to both endpoints.
  const candidatePool: WallCoord[] = []
  const seen = new Set<string>()

  for (const { q, r } of allCells) {
    for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
      const q2 = q + dq
      const r2 = r + dr
      if (!isOnBoard(q2, r2)) continue
      if (obstacleKeys.has(`${q},${r}`) && obstacleKeys.has(`${q2},${r2}`)) continue

      const k = canonicalEdgeKey(q, r, q2, r2)
      if (seen.has(k)) continue
      seen.add(k)

      const clearOfChaser = hexDistance(q, r, chaserPos.q, chaserPos.r) > 2
        && hexDistance(q2, r2, chaserPos.q, chaserPos.r) > 2
      const clearOfEvader = hexDistance(q, r, evaderPos.q, evaderPos.r) > 2
        && hexDistance(q2, r2, evaderPos.q, evaderPos.r) > 2
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
  const sectionCount = 2

  for (const startEdge of candidatePool) {
    if (sectionsPlaced >= sectionCount) break
    if (!availableKeys.has(canonicalEdgeKey(startEdge.q1, startEdge.r1, startEdge.q2, startEdge.r2))) continue

    if (wouldCreateThreeConsecutiveWalls(startEdge, placedWallSet)) continue

    const targetLen = Math.floor(Math.random() * 3) + 4  // 4, 5, or 6 segments
    const section = growWallSection(startEdge, targetLen, availableKeys, placedWallSet)
    if (section.length < 4) continue

    // Verify chaser and evader remain connected with all placed walls so far plus this section
    const testSet = new Set(placedWallSet)
    for (const { q1, r1, q2, r2 } of section) {
      testSet.add(`${q1},${r1}>${q2},${r2}`)
      testSet.add(`${q2},${r2}>${q1},${r1}`)
    }
    if (!isConnectedThrough(chaserPos, evaderPos, obstacleKeys, testSet)) continue

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
  walls: Set<string> = new Set(),
): HexCoord[] {
  return Object.values(HEX_DIRECTIONS)
    .map(({ dq, dr }) => ({ q: pos.q + dq, r: pos.r + dr }))
    .filter(({ q, r }) =>
      isOnBoard(q, r)
      && !blocked.has(`${q},${r}`)
      && isPassable(pos, { q, r }, walls),
    )
}

/** All cells reachable from pos in 2 steps. Excludes pos itself. */
export function reachableDestinations(
  pos: HexCoord,
  blocked: Set<string>,
  walls: Set<string> = new Set(),
): HexCoord[] {
  const step1Cells = validNeighbors(pos, blocked, walls)
  const startKey = `${pos.q},${pos.r}`
  const reached = new Set<string>(step1Cells.map(h => `${h.q},${h.r}`))
  const result = [...step1Cells]
  for (const mid of step1Cells) {
    for (const h of validNeighbors(mid, blocked, walls)) {
      const key = `${h.q},${h.r}`
      if (key !== startKey && !reached.has(key)) {
        reached.add(key)
        result.push(h)
      }
    }
  }
  return result
}

import { getPowerStrategy } from './powers/PowerFactory'
import type { StandardPlan, LinePlan, ReactionPlan, IdlePlan } from '../types'

// ── Movement ──────────────────────────────────────────────────────────────

/**
 * Finds a valid intermediate cell between start and a destination up to 2 steps away.
 * Returns the first unblocked neighbor of start that is also a neighbor of destination,
 * or the destination itself if it is 1 step away.
 */
export function findIntermediateCell(
  start: HexCoord,
  destination: HexCoord,
  blocked: Set<string>,
  walls: Set<string> = new Set(),
): HexCoord | null {
  if (hexDistance(start.q, start.r, destination.q, destination.r) === 1) {
    if (isOnBoard(destination.q, destination.r) && !blocked.has(`${destination.q},${destination.r}`) && isPassable(start, destination, walls)) {
      return destination
    }
    return null
  }

  for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
    const mid = { q: start.q + dq, r: start.r + dr }
    if (!isOnBoard(mid.q, mid.r)) continue
    if (blocked.has(`${mid.q},${mid.r}`)) continue
    if (!isPassable(start, mid, walls)) continue
    const destIsAdjacentToMid = Object.values(HEX_DIRECTIONS).some(
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

/**
 * Execute a planned path to a destination.
 * Destination may be 1 or 2 steps away.
 * Returns the sequence of positions actually visited.
 */
export function executePath(
  startPos: HexCoord,
  targetDest: HexCoord,
  blocked: Set<string>,
  walls: Set<string> = new Set(),
): HexCoord[] {
  const visited: HexCoord[] = []
  const mid = findIntermediateCell(startPos, targetDest, blocked, walls)

  if (mid) {
    visited.push(mid)
    if (mid.q !== targetDest.q || mid.r !== targetDest.r) {
      if (!blocked.has(`${targetDest.q},${targetDest.r}`) && isPassable(mid, targetDest, walls)) {
        visited.push(targetDest)
      }
    }
  }

  return visited
}

// ── Round resolution ───────────────────────────────────────────────────────

export function processPhase(
  state: GameState,
  p1Plan: TurnPlan | null,
  p2Plan: TurnPlan | null,
): GameState {
  const chaserStrat = getPowerStrategy(state.chaserPower)
  const evaderStrat = getPowerStrategy(state.evaderPower)

  let nextState = { ...state, transientContext: { ...state.transientContext } }

  // Inject default "skip" plans for empty schemas if they weren't provided.
  // The orchestrator may pass null if the player wasn't required to submit anything.
  const resolvedP1Plan = p1Plan || { type: 'standard', turn: state.turn, phase: state.phase } as TurnPlan
  const resolvedP2Plan = p2Plan || { type: 'standard', turn: state.turn, phase: state.phase } as TurnPlan

  if (state.phase === 'declaring') {
    if (resolvedP1Plan.type === 'declaration') {
      nextState.transientContext.chaserDeclaration = resolvedP1Plan.declaredDest
    }
    if (resolvedP2Plan.type === 'declaration') {
      nextState.transientContext.evaderDeclaration = resolvedP2Plan.declaredDest
    }
    nextState.phase = 'planning'

    const turnSchema: GameState['turnSchema'] = {
      chaser: { requiredSteps: chaserStrat.getRequiredSteps(nextState.phase) },
      evader: { requiredSteps: evaderStrat.getRequiredSteps(nextState.phase) },
    }
    nextState.turnSchema = turnSchema
    return nextState

  } else if (state.phase === 'planning') {
    if (chaserStrat.requiresPhase('reacting') || evaderStrat.requiresPhase('reacting')) {
      nextState.transientContext.chaserUnmaskedMove = getMoveDestOrNull(resolvedP1Plan)
      nextState.transientContext.evaderUnmaskedMove = getMoveDestOrNull(resolvedP2Plan)

      nextState.transientContext.chaserPlanningPlan = resolvedP1Plan
      nextState.transientContext.evaderPlanningPlan = resolvedP2Plan

      nextState.phase = 'reacting'

      const turnSchema: GameState['turnSchema'] = {
        chaser: { requiredSteps: chaserStrat.getRequiredSteps(nextState.phase) },
        evader: { requiredSteps: evaderStrat.getRequiredSteps(nextState.phase) },
      }
      nextState.turnSchema = turnSchema
      return nextState
    } else {
      return _resolveRound(nextState, resolvedP1Plan, resolvedP2Plan)
    }

  } else if (state.phase === 'reacting') {
    const p1PlanningPlan = state.transientContext.chaserPlanningPlan as TurnPlan
    const p2PlanningPlan = state.transientContext.evaderPlanningPlan as TurnPlan

    nextState.transientContext.chaserReactionPlan = resolvedP1Plan
    nextState.transientContext.evaderReactionPlan = resolvedP2Plan

    return _resolveRound(nextState, p1PlanningPlan, p2PlanningPlan)
  }

  return nextState
}

function getMoveDestOrNull(plan: TurnPlan | null): HexCoord | [HexCoord, HexCoord] | null {
  if (!plan) return null
  if (plan.type === 'standard') return (plan as StandardPlan).moveDest
  if (plan.type === 'line') return (plan as LinePlan).moveDest
  return null
}

function _resolveRound(
  state: GameState,
  p1Plan: TurnPlan,
  p2Plan: TurnPlan,
): GameState {
  const { chaserPos, evaderPos, obstacles, walls, turn, chaserPower, evaderPower } = state
  const baseBlocked = obstacleSet(obstacles)
  const baseWalls = buildWallSet(walls)

  const chaserStrat = getPowerStrategy(chaserPower)
  const evaderStrat = getPowerStrategy(evaderPower)

  // 1. Evaluate pre-movement
  let chaserExecutes = chaserStrat.onBeforeMoveExecution(
    { state, role: 'chaser', myPlan: p1Plan, oppPlan: p2Plan },
    true
  )
  let evaderExecutes = evaderStrat.onBeforeMoveExecution(
    { state, role: 'evader', myPlan: p2Plan, oppPlan: p1Plan },
    true
  )

  // 2. Determine Predictions Hits
  const getMoveDest = (plan: TurnPlan) => {
    if (plan.type === 'standard') return (plan as StandardPlan).moveDest
    if (plan.type === 'line') return (plan as LinePlan).moveDest[0]
    return null
  }
  const getPredDest = (plan: TurnPlan) => {
    if (plan.type === 'standard') return (plan as StandardPlan).predictDest
    if (plan.type === 'line') return (plan as LinePlan).predictDest
    if (plan.type === 'idle') return (plan as IdlePlan).predictDest
    return null
  }

  const p1Pred = getPredDest(p1Plan)
  const p2Move = getMoveDest(p2Plan)
  const p2Pred = getPredDest(p2Plan)
  const p1Move = getMoveDest(p1Plan)

  const chaserPredHit = p1Pred && p2Move && p1Pred.q === p2Move.q && p1Pred.r === p2Move.r
  const evaderPredHit = p2Pred && p1Move && p2Pred.q === p1Move.q && p2Pred.r === p1Move.r

  // 3. Compute Paths via Strategy
  const defaultChaserPath = chaserExecutes && p1Move
    ? executePath(chaserPos, p1Move, baseBlocked, baseWalls)
    : []
  const defaultEvaderPath = evaderExecutes && p2Move
    ? executePath(evaderPos, p2Move, baseBlocked, baseWalls)
    : []

  const chaserPath = chaserStrat.onPathExecution(
    { state, role: 'chaser', startPos: chaserPos, targetDest: p1Move, blocked: baseBlocked, walls: baseWalls, myPlan: p1Plan, oppPlan: p2Plan },
    defaultChaserPath
  )
  const evaderPath = evaderStrat.onPathExecution(
    { state, role: 'evader', startPos: evaderPos, targetDest: p2Move, blocked: baseBlocked, walls: baseWalls, myPlan: p2Plan, oppPlan: p1Plan },
    defaultEvaderPath
  )

  let newChaserPos = chaserPath.length > 0 ? chaserPath[chaserPath.length - 1] : chaserPos
  let newEvaderPos = evaderPath.length > 0 ? evaderPath[evaderPath.length - 1] : evaderPos

  // 4. Bonus Calculation
  let chaserBonusAllowed = chaserStrat.onBonusCalculation(
    { state, role: 'chaser', myPlan: p1Plan, oppPlan: p2Plan, predHit: !!chaserPredHit, oppPredHit: !!evaderPredHit },
    !!chaserPredHit
  )

  let evaderBonusAllowed = evaderStrat.onBonusCalculation(
    { state, role: 'evader', myPlan: p2Plan, oppPlan: p1Plan, predHit: !!evaderPredHit, oppPredHit: !!chaserPredHit },
    !!evaderPredHit
  )

  // Opponent nullification hooks (e.g. Declarer fulfilling but opponent predicted it)
  if (chaserStrat.name === 'Declarer' && chaserBonusAllowed && evaderPredHit) {
    // If the Chaser is Declarer and fulfilled it (chaserBonusAllowed is true)
    // AND the Evader correctly predicted the Chaser's declared move,
    // the Evader's bonus is explicitly nullified.
    evaderBonusAllowed = false
  }

  if (evaderStrat.name === 'Declarer' && evaderBonusAllowed && chaserPredHit) {
    chaserBonusAllowed = false
  }

  let chaserBonusUsed = false
  const p1Bonus = (p1Plan as StandardPlan | LinePlan | IdlePlan).bonusMove
  if (chaserBonusAllowed && p1Bonus) {
    if (hexDistance(newChaserPos.q, newChaserPos.r, p1Bonus.q, p1Bonus.r) === 1) {
      if (!baseBlocked.has(`${p1Bonus.q},${p1Bonus.r}`) && isPassable(newChaserPos, p1Bonus, baseWalls)) {
        chaserPath.push(p1Bonus)
        newChaserPos = p1Bonus
        chaserBonusUsed = true
      }
    }
  }

  let evaderBonusUsed = false
  const p2Bonus = (p2Plan as StandardPlan | LinePlan | IdlePlan).bonusMove
  if (evaderBonusAllowed && p2Bonus) {
    if (hexDistance(newEvaderPos.q, newEvaderPos.r, p2Bonus.q, p2Bonus.r) === 1) {
      if (!baseBlocked.has(`${p2Bonus.q},${p2Bonus.r}`) && isPassable(newEvaderPos, p2Bonus, baseWalls)) {
        evaderPath.push(p2Bonus)
        newEvaderPos = p2Bonus
        evaderBonusUsed = true
      }
    }
  }

  const resolution: ResolutionSummary = {
    chaserPredHit: !!chaserPredHit,
    evaderPredHit: !!evaderPredHit,
    chaserBonusUsed,
    evaderBonusUsed,
  }

  return buildNextState(state, newChaserPos, newEvaderPos, chaserPath, evaderPath, resolution, p1Plan, p2Plan)
}

function buildNextState(
  state: GameState,
  newChaserPos: HexCoord,
  newEvaderPos: HexCoord,
  chaserPath: HexCoord[],
  evaderPath: HexCoord[],
  resolution: ResolutionSummary,
  p1Plan: TurnPlan,
  p2Plan: TurnPlan
): GameState {
  const { chaserPos, evaderPos, turn, chaserPower, evaderPower } = state
  const chaserStrat = getPowerStrategy(chaserPower)
  const evaderStrat = getPowerStrategy(evaderPower)

  // Always check for same-cell collision during movement (simultaneous step-by-step)
  let finalChaserPos = newChaserPos
  let finalEvaderPos = newEvaderPos
  let finalChaserPath = chaserPath
  let finalEvaderPath = evaderPath

  const midCollision = findMidCollision(chaserPos, evaderPos, chaserPath, evaderPath)
  if (midCollision !== null) {
    finalChaserPos = midCollision.chaserPos
    finalEvaderPos = midCollision.evaderPos
    finalChaserPath = chaserPath.slice(0, midCollision.step)
    finalEvaderPath = evaderPath.slice(0, midCollision.step)
  }

  // End-of-turn adjacency check always applies
  const chaserCatches = hexDistance(finalChaserPos.q, finalChaserPos.r, finalEvaderPos.q, finalEvaderPos.r) <= 1

  // Win condition: Evader survived max turns, or chaser caught evader
  const evaderSurvived = !chaserCatches && turn >= MAX_TURNS
  const winner = chaserCatches ? 'chaser' : evaderSurvived ? 'evader' : null

  // Process modifiers
  let modifiers = state.modifiers.filter(m => m.expiresAtTurn > turn)
  modifiers = modifiers.concat(chaserStrat.onRoundEnd(state, 'chaser', p1Plan))
  modifiers = modifiers.concat(evaderStrat.onRoundEnd(state, 'evader', p2Plan))

  // Determine the next phase pipeline start
  // In a new round, we start with declaring, then planning, then reacting.
  // If no declarer, skip declaring.
  let nextPhase: GameState['phase'] = 'planning'
  if (chaserStrat.requiresPhase('declaring') || evaderStrat.requiresPhase('declaring')) {
    nextPhase = 'declaring'
  }

  return {
    ...state,
    chaserPos: finalChaserPos,
    evaderPos: finalEvaderPos,
    prevChaserPath: finalChaserPath.length > 0 ? [chaserPos, ...finalChaserPath] : null,
    prevEvaderPath: finalEvaderPath.length > 0 ? [evaderPos, ...finalEvaderPath] : null,
    turn: turn + 1,
    phase: nextPhase,
    winner,
    p1Plan: null,
    p2Plan: null,
    modifiers,
    transientContext: {}, // reset transient state for the next turn
    lastResolution: resolution,
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
): { step: number; chaserPos: HexCoord; evaderPos: HexCoord } | null {
  const totalSteps = Math.max(chaserPath.length, evaderPath.length)
  let cp = chaserStart
  let ep = evaderStart

  for (let i = 0; i < totalSteps; i++) {
    cp = chaserPath[i] ?? cp
    ep = evaderPath[i] ?? ep
    if (hexDistance(cp.q, cp.r, ep.q, ep.r) === 0) {
      return { step: i + 1, chaserPos: cp, evaderPos: ep }
    }
  }

  return null
}
