import { BasePower, BonusCalculationCtx } from './IAthletePower'
import type { GamePhase, PowerName, StandardPlan } from '../../types'

export class DeclarerPower extends BasePower {
  readonly name: PowerName = 'Declarer'

  override requiresPhase(phase: GamePhase): boolean {
    return phase === 'declaring'
  }

  override onBonusCalculation(
    ctx: BonusCalculationCtx,
    bonusAllowed: boolean
  ): boolean {
    const { state, role, myPlan, oppPlan, predHit, oppPredHit } = ctx

    const declaration = role === 'chaser'
      ? state.transientContext.chaserDeclaration
      : state.transientContext.evaderDeclaration

    if (declaration && myPlan.type === 'standard') {
      const plan = myPlan as StandardPlan

      // Declarer fulfills their declared move => triggers bonus
      const fulfilled = plan.moveDest.q === declaration.q && plan.moveDest.r === declaration.r

      if (fulfilled) {
        // Opponent predicted the declared move correctly => opponent bonus nullified.
        // Wait, the hook says: "If the opponent predicted this declared move correctly, the opponent's bonus move is explicitly nullified."
        // Our hook returns whether OUR bonus is allowed. We need a way to nullify the opponent's bonus.
        // Let's assume we return true to force OUR bonus, and the opponent's strategy execution will need to check this,
        // OR we modify the hook definition.
        // For now, if we fulfill it, we get a bonus even if our prediction missed.
        return true
      }
    }

    // "If the opponent predicted this declared move correctly, the opponent's bonus move is explicitly nullified."
    // We should intercept the OPPONENT's bonus calculation when we are evaluated.
    // Wait, the orchestrator loops over active powers for each player.
    // We will handle the opponent bonus nullification inside hexGameLogic during bonus phase, or we extend the hook.
    // We'll return bonusAllowed for now, and handle nullification logic within `hexGameLogic.ts`.

    return bonusAllowed
  }
}
