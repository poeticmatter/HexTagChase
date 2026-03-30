import { BasePower, ReachableDestinationsCtx, PathExecutionCtx } from './IAthletePower'
import type { HexCoord, PowerName, StandardPlan, LinePlan } from '../../types'
import { hexDistance, isOnBoard, HEX_DIRECTIONS } from '../hexGrid'

export class ClimberPower extends BasePower {
  readonly name: PowerName = 'Climber'
  readonly description = 'You can move through obstacle hexes as intermediate steps. This lets you reach destinations that are blocked to other athletes.'

  override onReachableDestinationsRequest(
    ctx: ReachableDestinationsCtx,
    baseDestinations: HexCoord[]
  ): HexCoord[] {
    const { state, pos, blocked, walls } = ctx

    // Allow climbing over obstacles
    const validNeighbors = Object.values(HEX_DIRECTIONS)
      .map(({ dq, dr }) => ({ q: pos.q + dq, r: pos.r + dr }))
      .filter(({ q, r }) => isOnBoard(q, r) && isPassable(pos, { q, r }, walls))

    const startKey = `${pos.q},${pos.r}`
    const reached = new Set<string>(validNeighbors.map(h => `${h.q},${h.r}`))
    const result = [...validNeighbors]

    for (const mid of validNeighbors) {
      // Step 2 neighbors
      const step2 = Object.values(HEX_DIRECTIONS)
        .map(({ dq, dr }) => ({ q: mid.q + dq, r: mid.r + dr }))
        .filter(({ q, r }) => isOnBoard(q, r) && isPassable(mid, { q, r }, walls))

      for (const h of step2) {
        const key = `${h.q},${h.r}`
        if (key !== startKey && !reached.has(key)) {
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
    if (ctx.myPlan.type === 'standard' || ctx.myPlan.type === 'line') {
      const targetDest = ctx.myPlan.type === 'standard'
        ? (ctx.myPlan as StandardPlan).moveDest
        : (ctx.myPlan as LinePlan).moveDest[0] // fallback if line is used

      const mid = findIntermediateCellClimber(ctx.startPos, targetDest, ctx.blocked, ctx.walls)

      const visited: HexCoord[] = []
      if (mid) {
        visited.push(mid)
        if (mid.q !== targetDest.q || mid.r !== targetDest.r) {
          if (isPassable(mid, targetDest, ctx.walls)) {
            visited.push(targetDest)
          }
        }
      }

      return visited
    }

    return defaultPath
  }
}

function isPassable(from: HexCoord, to: HexCoord, wallSet: Set<string>): boolean {
  return !wallSet.has(`${from.q},${from.r}>${to.q},${to.r}`)
}

function findIntermediateCellClimber(
  start: HexCoord,
  destination: HexCoord,
  blocked: Set<string>,
  walls: Set<string>
): HexCoord | null {
  if (hexDistance(start.q, start.r, destination.q, destination.r) === 1) {
    if (isOnBoard(destination.q, destination.r) && isPassable(start, destination, walls)) {
      return destination
    }
    return null
  }

  for (const { dq, dr } of Object.values(HEX_DIRECTIONS)) {
    const mid = { q: start.q + dq, r: start.r + dr }
    if (!isOnBoard(mid.q, mid.r)) continue
    // Climber can move onto an obstacle as an intermediate cell
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
