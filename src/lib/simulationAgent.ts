import { GameState, TurnPlan, Role, HexCoord } from '../types'
import { reachableDestinations, buildWallSet } from './hexGameLogic'
import { hexDistance } from './hexGrid'

export type SimulationAgent = 'random' | 'greedy'

/**
 * Produces a complete turn plan (movement + prediction) for a given agent strategy.
 *
 * @param agent - Strategy type ('random' or 'greedy')
 * @param gameState - The current game state
 * @param role - The role of the agent ('chaser' or 'evader')
 * @returns A valid TurnPlan
 */
export function produceTurnPlan(
  agent: SimulationAgent,
  gameState: GameState,
  role: Role
): TurnPlan {
  const isChaser = role === 'chaser'
  const myPos = isChaser ? gameState.chaserPos : gameState.evaderPos
  const oppPos = isChaser ? gameState.evaderPos : gameState.chaserPos
  const myBudget = isChaser ? gameState.p1Budget : gameState.p2Budget
  const oppBudget = isChaser ? gameState.p2Budget : gameState.p1Budget
  const walls = buildWallSet(gameState.walls)

  const myReachable = reachableDestinations(myPos, gameState.elevations, walls, myBudget)
  const oppReachable = reachableDestinations(oppPos, gameState.elevations, walls, oppBudget)

  // 1. Movement selection
  const { dest: moveDest, path: movePath } = agent === 'random'
    ? pickRandom(myReachable, myPos)
    : pickGreedy(myReachable, oppPos, isChaser)

  // 2. Prediction selection (simulate what opponent would do)
  const predictDest = agent === 'random'
    ? pickRandom(oppReachable, oppPos).dest
    : pickGreedy(oppReachable, myPos, !isChaser).dest

  if (isChaser) {
    return {
      type: 'chaser',
      turn: gameState.turn,
      moveDest,
      movePath,
      predictDest
    }
  } else {
    return {
      type: 'evader',
      turn: gameState.turn,
      moveDest,
      movePath,
      predictDest
    }
  }
}

// ── Pure Selection Functions ──────────────────────────────────────────────────

function pickRandom(reachable: Map<string, HexCoord[]>, fallback: HexCoord): { dest: HexCoord, path: HexCoord[] } {
  const reachableArray = Array.from(reachable.entries())
  if (reachableArray.length === 0) {
    return { dest: fallback, path: [] }
  }
  const pick = reachableArray[Math.floor(Math.random() * reachableArray.length)]
  const [destKey, path] = pick
  const [q, r] = destKey.split(',').map(Number)
  return { dest: { q, r }, path }
}

export function pickGreedy(
  reachable: Map<string, HexCoord[]>,
  targetPos: HexCoord,
  minimizeDistance: boolean
): { dest: HexCoord, path: HexCoord[] } {
  let bestDist = minimizeDistance ? Infinity : -Infinity
  let bestPicks: Array<{ dest: HexCoord, path: HexCoord[] }> = []

  for (const [destKey, path] of reachable.entries()) {
    const [q, r] = destKey.split(',').map(Number)
    const dist = hexDistance(q, r, targetPos.q, targetPos.r)

    if (minimizeDistance) {
      if (dist < bestDist) {
        bestDist = dist
        bestPicks = [{ dest: { q, r }, path }]
      } else if (dist === bestDist) {
        bestPicks.push({ dest: { q, r }, path })
      }
    } else {
      if (dist > bestDist) {
        bestDist = dist
        bestPicks = [{ dest: { q, r }, path }]
      } else if (dist === bestDist) {
        bestPicks.push({ dest: { q, r }, path })
      }
    }
  }

  return bestPicks[Math.floor(Math.random() * bestPicks.length)]
}
