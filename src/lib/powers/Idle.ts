import { BasePower, ReachableDestinationsCtx } from './IAthletePower'
import type { GameState, Role, TurnPlan, Modifier, PowerName, HexCoord, GamePhase, UIStep } from '../../types'
import { validNeighbors, reachableDestinations } from '../hexGameLogic'

export class IdlePower extends BasePower {
  readonly name: PowerName = 'Idle'
  readonly description = 'You may skip your move this turn. Doing so grants you range-3 movement on your next turn, letting you reach hexes two steps further than normal.'

  override getRequiredSteps(phase: GamePhase): UIStep[] {
    if (phase === 'planning') {
      return ['idle_confirmation']
    }
    return []
  }

  override onReachableDestinationsRequest(
    ctx: ReachableDestinationsCtx,
    baseDestinations: HexCoord[]
  ): HexCoord[] {
    const { state, role, pos, blocked, walls } = ctx

    // Check if player has the range_3 modifier active
    const hasBuff = state.modifiers.some(m => m.role === role && m.effect === 'range_3')

    if (hasBuff) {
      // Expand to range 3
      const step2Cells = baseDestinations
      const reached = new Set<string>(step2Cells.map(h => `${h.q},${h.r}`))
      const result = [...step2Cells]

      // We need to find step 3 from step 2
      for (const mid of step2Cells) {
        // Technically this finds step 3 from step 2, but we need to ensure they are 3 steps from pos
        for (const h of validNeighbors(mid, blocked, walls)) {
          const key = `${h.q},${h.r}`
          if (key !== `${pos.q},${pos.r}` && !reached.has(key)) {
            reached.add(key)
            result.push(h)
          }
        }
      }

      return result
    }

    return baseDestinations
  }

  override onRoundEnd(state: GameState, role: Role, myPlan: TurnPlan): Modifier[] {
    if (myPlan.type === 'idle') {
      return [{
        role,
        effect: 'range_3',
        expiresAtTurn: state.turn + 1 // Buff lasts for next turn only
      }]
    }
    return []
  }
}
