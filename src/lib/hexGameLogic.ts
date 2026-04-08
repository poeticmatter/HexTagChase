import type {
  HexCoord, WallCoord, GameState, TurnPlan, ResolutionSummary,
  Role, TurnSchema, UIStep, MatchSettings, ChaserPlan, EvaderPlan,
} from '../types'
import { buildElevationsMap, getBaseElevation } from './topography'
import {
  HEX_RADIUS, hexDistance, isOnBoard, HEX_DIRECTIONS, getAllHexes,
} from './hexGrid'
import { mapRegistry } from './mapRegistry'

// ── Obstacles ──────────────────────────────────────────────────────────────

export function buildInitialState(settings: MatchSettings): GameState {
  const mapDef = mapRegistry.getMapById(settings.mapId)
  if (!mapDef) {
    throw new Error(`Map with id "${settings.mapId}" not found in registry.`)
  }

  const elevations = buildElevationsMap(mapDef)

  return {
    settings,
    matchState: { roundNumber: 1, history: [], matchWinner: null },
    chaserPos: mapDef.chaserStart,
    evaderPos: mapDef.evaderStart,
    prevChaserPath: null,
    prevEvaderPath: null,
    turn: 1,
    winner: null,
    obstacles: mapDef.obstacles,
    elevations,
    walls: mapDef.walls,
    p1Budget: settings.baseMovement ?? 2,
    p2Budget: settings.baseMovement ?? 2,
    transientContext: {},
    turnSchema: buildPlanningSchema(),
    p1TurnData: {},
    p2TurnData: {},
    lastResolution: null,
  }
}

// ── Obstacles ──────────────────────────────────────────────────────────────

export function obstacleSet(obstacles: HexCoord[]): Set<string> {
  return new Set(obstacles.map(h => `${h.q},${h.r}`))
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

export function isPassable(from: HexCoord, to: HexCoord, wallSet: Set<string>): boolean {
  return !wallSet.has(`${from.q},${from.r}>${to.q},${to.r}`)
}

function isConnectedThrough(
  from: HexCoord,
  to: HexCoord,
  elevations: Record<string, number>,
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
      if (getBaseElevation(nq, nr, elevations) === -1) continue
      // Obstacles are fully traversable, only walls block connectivity.
      if (wallSet.has(`${key}>${nk}`)) continue
      if (!visited.has(nk)) queue.push(nk)
    }
  }
  return false
}

// ── Wall section helpers ──────────────────────────────────────────────────

function canonicalEdgeKey(q1: number, r1: number, q2: number, r2: number): string {
  const norm = normalizeWall(q1, r1, q2, r2)
  return `${norm.q1},${norm.r1}|${norm.q2},${norm.r2}`
}

function normalizeWall(q1: number, r1: number, q2: number, r2: number): WallCoord {
  return q1 < q2 || (q1 === q2 && r1 < r2) ? { q1, r1, q2, r2 } : { q1: q2, r1: r2, q2: q1, r2: r1 }
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
  const A = { q: q1, r: r1 }
  const B = { q: q2, r: r2 }

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

// ── Movement & Pathfinding ──────────────────────────────────────────────────

export function calculateEdgeCost(
  fromHex: HexCoord,
  toHex: HexCoord,
  elevations: Record<string, number>,
  walls: Set<string>,
): number {
  const fromKey = `${fromHex.q},${fromHex.r}`
  const toKey = `${toHex.q},${toHex.r}`

  const fromLevel = elevations[fromKey] ?? 0
  const toLevel = elevations[toKey] ?? 0
  const isWall = walls.has(`${fromKey}>${toKey}`)

  const deltaH = toLevel - fromLevel
  let baseCost = 1

  if (deltaH > 0) {
    baseCost = 1 + deltaH
  }

  return baseCost + (isWall ? 1 : 0)
}

// ── Neighbors ─────────────────────────────────────────────────────────────

/** All valid neighbors of a cell for standard non-gameplay queries (ignores obstacles, checks walls).
 *  Note: For gameplay targeting (like bonus moves), use calculateEdgeCost <= 1 instead.
 */
export function validNeighbors(
  pos: HexCoord,
  blocked: Set<string>,
  walls: Set<string> = new Set(),
  elevations: Record<string, number> = {},
): HexCoord[] {
  return Object.values(HEX_DIRECTIONS)
    .map(({ dq, dr }) => ({ q: pos.q + dq, r: pos.r + dr }))
    .filter(({ q, r }) =>
      isOnBoard(q, r)
      && isPassable(pos, { q, r }, walls)
      && getBaseElevation(q, r, elevations) !== -1,
    )
}

/**
 * All cells reachable from pos within a given movement budget.
 * Returns a Map where keys are destination hex strings ("q,r") and values
 * are the shortest paths to reach them (array of HexCoord, not including the start node).
 * Obstacles are treated as traversable based on calculateEdgeCost.
 */
export function reachableDestinations(
  pos: HexCoord,
  elevations: Record<string, number>,
  walls: Set<string> = new Set(),
  budget = 2,
): Map<string, HexCoord[]> {
  const startKey = `${pos.q},${pos.r}`
  const bestCost = new Map<string, number>([[startKey, 0]])
  const paths = new Map<string, HexCoord[]>([[startKey, []]])

  // Dijkstra priority queue (cost, path)
  const queue: Array<{ hex: HexCoord; spent: number; path: HexCoord[] }> = [
    { hex: pos, spent: 0, path: [] },
  ]

  const reachablePaths = new Map<string, HexCoord[]>()

  while (queue.length > 0) {
    // Sort to act as priority queue (process lowest cost first)
    queue.sort((a, b) => a.spent - b.spent)
    const { hex, spent, path } = queue.shift()!
    const currentKey = `${hex.q},${hex.r}`

    if ((bestCost.get(currentKey) ?? Infinity) < spent) continue

    for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
      const nq = hex.q + dq
      const nr = hex.r + dr
      const nk = `${nq},${nr}`

      if (!isOnBoard(nq, nr)) continue
      if (getBaseElevation(nq, nr, elevations) === -1) continue

      const nextHex = { q: nq, r: nr }
      const edgeCost = calculateEdgeCost(hex, nextHex, elevations, walls)
      const newCost = spent + edgeCost

      if (newCost > budget) continue

      const prevCost = bestCost.get(nk)
      if (prevCost !== undefined && prevCost <= newCost) continue

      const newPath = [...path, nextHex]
      bestCost.set(nk, newCost)
      paths.set(nk, newPath)
      reachablePaths.set(nk, newPath)

      queue.push({ hex: nextHex, spent: newCost, path: newPath })
    }
  }

  return reachablePaths
}

// ── Schema building ────────────────────────────────────────────────────────

/** Returns the initial turnSchema for the planning phase based on match settings. */
export function buildPlanningSchema(): Record<Role, TurnSchema> {
  const steps: UIStep[] = ['select_movement', 'select_prediction']
  return {
    chaser: { requiredSteps: steps },
    evader: { requiredSteps: steps },
  }
}

// ── Round resolution ───────────────────────────────────────────────────────

export function buildNextRoundState(prevState: GameState): GameState {
  const mapDef = mapRegistry.getMapById(prevState.settings.mapId)
  if (!mapDef) throw new Error(`Map with id ${prevState.settings.mapId} not found.`)

  const newSettings = {
    ...prevState.settings,
    chaserPlayer: prevState.settings.chaserPlayer === 1 ? 2 : 1 as 1 | 2
  }

  const elevations = buildElevationsMap(mapDef)

  return {
    ...prevState,
    settings: newSettings,
    matchState: {
      ...prevState.matchState,
      roundNumber: prevState.matchState.roundNumber + 1
    },
    chaserPos: mapDef.chaserStart,
    evaderPos: mapDef.evaderStart,
    prevChaserPath: null,
    prevEvaderPath: null,
    turn: 1,
    winner: null,
    obstacles: mapDef.obstacles,
    elevations,
    p1Budget: newSettings.baseMovement ?? 2,
    p2Budget: newSettings.baseMovement ?? 2,
    p1TurnData: {},
    p2TurnData: {},
    transientContext: {},
    turnSchema: buildPlanningSchema(),
    lastResolution: null,
  }
}

export function processPhase(
  state: GameState,
  p1Plan: TurnPlan | null,
  p2Plan: TurnPlan | null,
): GameState {
  const nextState = {
    ...state,
    transientContext: { ...state.transientContext },
    p1TurnData: { ...state.p1TurnData },
    p2TurnData: { ...state.p2TurnData },
  }

  if (p1Plan) nextState.p1TurnData = { ...nextState.p1TurnData, planning: p1Plan }
  if (p2Plan) nextState.p2TurnData = { ...nextState.p2TurnData, planning: p2Plan }

  return _resolveRound(nextState)
}

/** Resolve the full round in one step. */
function _resolveRound(state: GameState): GameState {
  const p1Plan = state.p1TurnData.planning
  const p2Plan = state.p2TurnData.planning

  if (!p1Plan || !p2Plan) {
    console.error('_resolveRound called without both planning plans', state.p1TurnData, state.p2TurnData)
    return state
  }

  // Determine paths based on roles
  const chaserPlan = p1Plan.type === 'chaser' ? p1Plan as ChaserPlan : p2Plan as ChaserPlan
  const evaderPlan = p2Plan.type === 'evader' ? p2Plan as EvaderPlan : p1Plan as EvaderPlan

  const chaserPath = [...chaserPlan.movePath]
  const evaderPath = [...evaderPlan.movePath]

  // Execute paths and check for mid-collisions
  let finalChaserPos = chaserPath.at(-1) ?? state.chaserPos
  let finalEvaderPos = evaderPath.at(-1) ?? state.evaderPos
  let finalChaserPath = chaserPath
  let finalEvaderPath = evaderPath

  const midCollision = findMidCollision(state.chaserPos, state.evaderPos, chaserPath, evaderPath)
  if (midCollision !== null) {
    finalChaserPos = midCollision.chaserPos
    finalEvaderPos = midCollision.evaderPos
    finalChaserPath = chaserPath.slice(0, midCollision.step)
    finalEvaderPath = evaderPath.slice(0, midCollision.step)
  }

  // Evaluate heights for adjacent tag end-of-path tag
  let chaserCatches = false
  const dist = hexDistance(finalChaserPos.q, finalChaserPos.r, finalEvaderPos.q, finalEvaderPos.r)

  if (dist === 0) {
    chaserCatches = true
  } else if (dist === 1) {
    const chaserElev = state.elevations[`${finalChaserPos.q},${finalChaserPos.r}`] ?? 0
    const evaderElev = state.elevations[`${finalEvaderPos.q},${finalEvaderPos.r}`] ?? 0
    if (chaserElev >= evaderElev) {
      chaserCatches = true
    }
  }

  const evaderSurvived = !chaserCatches && state.turn >= state.settings.maxTurns
  const winner: Role | null = chaserCatches ? 'chaser' : evaderSurvived ? 'evader' : null

  let matchState = state.matchState
  if (winner) {
    const winnerPlayer = winner === 'chaser' ? state.settings.chaserPlayer : (state.settings.chaserPlayer === 1 ? 2 : 1)
    const newHistory = [...matchState.history, winnerPlayer]
    let matchWinner: 1 | 2 | null = null
    if (newHistory.length >= 2 && newHistory[newHistory.length - 1] === newHistory[newHistory.length - 2]) {
      matchWinner = winnerPlayer
    }
    matchState = {
      ...matchState,
      history: newHistory,
      matchWinner
    }
  }

  // Evaluate predictions against actual landing hexes (after mid-collisions are resolved)
  const finalP1Pos = p1Plan.type === 'chaser' ? finalChaserPos : finalEvaderPos
  const finalP2Pos = p2Plan.type === 'chaser' ? finalChaserPos : finalEvaderPos

  const p1PredHit = p1Plan.predictDest.q === finalP2Pos.q && p1Plan.predictDest.r === finalP2Pos.r
  const p2PredHit = p2Plan.predictDest.q === finalP1Pos.q && p2Plan.predictDest.r === finalP1Pos.r

  const chaserPredHit = p1Plan.type === 'chaser' ? p1PredHit : p2PredHit
  const evaderPredHit = p2Plan.type === 'evader' ? p2PredHit : p1PredHit

  // Determine budgets for next round
  const baseMovement = state.settings.baseMovement ?? 2
  let nextP1Budget = baseMovement
  let nextP2Budget = baseMovement

  if (!winner) {
    nextP1Budget += p1PredHit ? 1 : 0
    nextP2Budget += p2PredHit ? 1 : 0
  }

  return {
    ...state,
    matchState,
    chaserPos: finalChaserPos,
    evaderPos: finalEvaderPos,
    prevChaserPath: finalChaserPath.length > 0 ? [state.chaserPos, ...finalChaserPath] : null,
    prevEvaderPath: finalEvaderPath.length > 0 ? [state.evaderPos, ...finalEvaderPath] : null,
    turn: state.turn + 1,
    winner,
    p1Budget: nextP1Budget,
    p2Budget: nextP2Budget,
    p1TurnData: {},
    p2TurnData: {},
    transientContext: {},
    turnSchema: buildPlanningSchema(),
    lastResolution: { chaserPredHit, evaderPredHit },
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
