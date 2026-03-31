import { BasePower, BonusCalculationCtx, BonusResult } from './IAthletePower'
import type { GamePhase, PowerName, StandardPlan, UIStep } from '../../types'

export class DeclarerPower extends BasePower {
  readonly name: PowerName = 'Declarer'
  readonly description = 'Before planning, publicly declare your intended destination. If you fulfill the declaration, you earn a bonus move — and if your opponent predicted you, their bonus is nullified.'

  override requiresPhase(phase: GamePhase): boolean {
    return phase === 'declaring'
  }

  override getRequiredSteps(phase: GamePhase): UIStep[] {
    if (phase === 'declaring') {
      return ['select_declaration']
    }
    return super.getRequiredSteps(phase)
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
