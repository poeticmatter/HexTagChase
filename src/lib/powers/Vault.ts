import { BasePower, BeforeMoveExecutionCtx, ReachableDestinationsCtx, PathExecutionCtx } from './IAthletePower'
import type { HexCoord, PowerName, StandardPlan } from '../../types'
import { hexDistance, isOnBoard, HEX_DIRECTIONS } from '../hexGrid'
import { obstacleSet, buildWallSet } from '../hexGameLogic'

export class VaultPower extends BasePower {
  readonly name: PowerName = 'Vault'
  readonly description = 'You can vault over obstacle hexes to reach destinations behind them. Movement is only cancelled if your opponent correctly predicts your landing hex AND your path crossed an obstacle.'

  override onReachableDestinationsRequest(
    ctx: ReachableDestinationsCtx,
    baseDestinations: HexCoord[]
  ): HexCoord[] {
    const { pos, blocked, walls } = ctx

    // All on-board, wall-passable neighbors — obstacles allowed as vault intermediates
    const step1Cells = Object.values(HEX_DIRECTIONS)
      .map(({ dq, dr }) => ({ q: pos.q + dq, r: pos.r + dr }))
      .filter(({ q, r }) => isOnBoard(q, r) && isWallPassable(pos, { q, r }, walls))

    const startKey = `${pos.q},${pos.r}`
    const reached = new Set<string>()
    const result: HexCoord[] = []

    for (const cell of step1Cells) {
      const key = `${cell.q},${cell.r}`
      if (!blocked.has(key)) {
        reached.add(key)
        result.push(cell)
      }
    }

    // From each step-1 cell (including obstacle intermediates), find non-obstacle step-2 destinations
    for (const mid of step1Cells) {
      for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
        const h = { q: mid.q + dq, r: mid.r + dr }
        const key = `${h.q},${h.r}`
        if (
          key !== startKey
          && !reached.has(key)
          && isOnBoard(h.q, h.r)
          && !blocked.has(key)
          && isWallPassable(mid, h, walls)
        ) {
          reached.add(key)
          result.push(h)
        }
      }
    }

    return result
  }

  override onPathExecution(
    ctx: PathExecutionCtx,
    defaultPath: HexCoord[]
  ): HexCoord[] {
    if (ctx.myPlan.type !== 'standard') return defaultPath

    const targetDest = (ctx.myPlan as StandardPlan).moveDest
    if (!targetDest) return defaultPath

    const mid = findVaultIntermediate(ctx.startPos, targetDest, ctx.blocked, ctx.walls)
    if (!mid) return defaultPath

    if (mid.q === targetDest.q && mid.r === targetDest.r) {
      return [mid]
    }

    if (isWallPassable(mid, targetDest, ctx.walls)) {
      return [mid, targetDest]
    }

    return [mid]
  }

  override onBeforeMoveExecution(
    ctx: BeforeMoveExecutionCtx,
    executeMove: boolean
  ): boolean {
    if (!executeMove) return false

    const myPlan = ctx.myPlan
    const oppPlan = ctx.oppPlan

    if (myPlan.type !== 'standard' || oppPlan.type !== 'standard') return executeMove

    const { moveDest } = myPlan as StandardPlan
    const { predictDest } = oppPlan as StandardPlan

    if (!moveDest || !predictDest) return executeMove

    // Only apply the Vault penalty when the path actually crossed an obstacle
    const myPos = ctx.role === 'chaser' ? ctx.state.chaserPos : ctx.state.evaderPos
    const blocked = obstacleSet(ctx.state.obstacles)
    const walls = buildWallSet(ctx.state.walls)
    const mid = findVaultIntermediate(myPos, moveDest, blocked, walls)

    const pathCrossedObstacle = mid !== null && blocked.has(`${mid.q},${mid.r}`)
    if (!pathCrossedObstacle) return executeMove

    if (moveDest.q === predictDest.q && moveDest.r === predictDest.r) {
      return false
    }

    return executeMove
  }
}

function isWallPassable(from: HexCoord, to: HexCoord, walls: Set<string>): boolean {
  return !walls.has(`${from.q},${from.r}>${to.q},${to.r}`)
}

/**
 * Finds the intermediate cell on the path from start to destination.
 * For 1-step moves, returns destination directly.
 * For 2-step moves, prefers non-obstacle intermediates; falls back to an obstacle
 * intermediate to support vaulting. Returns null if no valid path exists.
 */
function findVaultIntermediate(
  start: HexCoord,
  destination: HexCoord,
  blocked: Set<string>,
  walls: Set<string>
): HexCoord | null {
  if (hexDistance(start.q, start.r, destination.q, destination.r) === 1) {
    if (isOnBoard(destination.q, destination.r) && isWallPassable(start, destination, walls)) {
      return destination
    }
    return null
  }

  let obstacleFallback: HexCoord | null = null

  for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
    const mid = { q: start.q + dq, r: start.r + dr }
    if (!isOnBoard(mid.q, mid.r)) continue
    if (!isWallPassable(start, mid, walls)) continue

    const destIsAdjacentToMid = Object.values(HEX_DIRECTIONS).some(({ dq: dq2, dr: dr2 }) => {
      const candidate = { q: mid.q + dq2, r: mid.r + dr2 }
      return (
        candidate.q === destination.q
        && candidate.r === destination.r
        && isWallPassable(mid, destination, walls)
      )
    })

    if (!destIsAdjacentToMid) continue

    if (!blocked.has(`${mid.q},${mid.r}`)) return mid // prefer non-obstacle path

    obstacleFallback ??= mid // remember first valid obstacle intermediate
  }

  return obstacleFallback
}
