import { BasePower, PathExecutionCtx, BonusCalculationCtx, BonusResult } from './IAthletePower'
import type { PowerName, LinePlan, HexCoord } from '../../types'
import { hexDistance, isOnBoard, HEX_DIRECTIONS } from '../hexGrid'

export class LinePower extends BasePower {
  readonly name: PowerName = 'Line'

  // Line uses 2 hex targets. During execution, it moves to the one NOT predicted.
  // If both predicted or both missed, it defaults to the first one (or we define a tiebreaker).
  override onPathExecution(
    ctx: PathExecutionCtx,
    defaultPath: HexCoord[]
  ): HexCoord[] {
    const { myPlan, oppPlan, blocked, walls, startPos } = ctx

    if (myPlan.type === 'line') {
      const linePlan = myPlan as LinePlan
      const [dest1, dest2] = linePlan.moveDest

      const oppPred = (oppPlan as any).predictDest

      let chosenDest = dest1

      if (oppPred) {
        const p1Hit = oppPred.q === dest1.q && oppPred.r === dest1.r
        const p2Hit = oppPred.q === dest2.q && oppPred.r === dest2.r

        if (p1Hit && !p2Hit) {
          chosenDest = dest2
        } else if (!p1Hit && p2Hit) {
          chosenDest = dest1
        }
        // If both hit or both miss, default to dest1
      }

      // Re-calculate path to chosenDest
      // Assuming a straightforward executePath algorithm similar to hexGameLogic
      // We will export and use `executePath` or recreate logic here if needed.
      return executePath(startPos, chosenDest, blocked, walls)
    }

    return defaultPath
  }

  override onBonusCalculation(
    ctx: BonusCalculationCtx,
    bonusAllowed: boolean
  ): BonusResult {
    let selfBonusAllowed = bonusAllowed

    const { myPlan, oppPlan } = ctx
    if (myPlan.type === 'line' && (oppPlan.type === 'standard' || oppPlan.type === 'line' || oppPlan.type === 'idle')) {
      const linePlan = myPlan as LinePlan
      const [dest1, dest2] = linePlan.moveDest
      const oppPred = oppPlan.predictDest

      if (oppPred) {
        const p1Hit = oppPred.q === dest1.q && oppPred.r === dest1.r
        const p2Hit = oppPred.q === dest2.q && oppPred.r === dest2.r

        if (p1Hit || p2Hit) {
          selfBonusAllowed = true
        }
      }
    }
    return { selfBonusAllowed, nullifyOpponentBonus: false }
  }
}

// Helper (duplicated from hexGameLogic, we'll refactor later)
function isPassable(from: HexCoord, to: HexCoord, wallSet: Set<string>): boolean {
  return !wallSet.has(`${from.q},${from.r}>${to.q},${to.r}`)
}

function findIntermediateCell(
  start: HexCoord,
  destination: HexCoord,
  blocked: Set<string>,
  walls: Set<string>
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

function executePath(
  startPos: HexCoord,
  targetDest: HexCoord,
  blocked: Set<string>,
  walls: Set<string>
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
