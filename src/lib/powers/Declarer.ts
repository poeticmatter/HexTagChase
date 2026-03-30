import { BasePower, BonusCalculationCtx, BonusResult } from './IAthletePower'
import type { GamePhase, PowerName, StandardPlan } from '../../types'

export class DeclarerPower extends BasePower {
  readonly name: PowerName = 'Declarer'

  override requiresPhase(phase: GamePhase): boolean {
    return phase === 'declaring'
  }

  override onBonusCalculation(
    ctx: BonusCalculationCtx,
    bonusAllowed: boolean
  ): BonusResult {
    const { state, role, myPlan, oppPredHit } = ctx

    const declaration = role === 'chaser'
      ? state.transientContext.chaserDeclaration
      : state.transientContext.evaderDeclaration

    let selfBonusAllowed = bonusAllowed
    let nullifyOpponentBonus = false

    if (declaration && myPlan.type === 'standard') {
      const plan = myPlan as StandardPlan

      // Declarer fulfills their declared move => triggers bonus
      const fulfilled = plan.moveDest.q === declaration.q && plan.moveDest.r === declaration.r

      if (fulfilled) {
        selfBonusAllowed = true
        if (oppPredHit) {
          nullifyOpponentBonus = true
        }
      }
    }

    return { selfBonusAllowed, nullifyOpponentBonus }
  }
}
