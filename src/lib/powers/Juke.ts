import { BasePower, BeforeMoveExecutionCtx } from './IAthletePower'
import type { GamePhase, PowerName, ReactionPlan, UIStep } from '../../types'

export class JukePower extends BasePower {
  readonly name: PowerName = 'Juke'
  readonly description = 'After both plans are locked in, you enter a reaction phase where you can choose to abort your move after seeing your opponent\'s committed plan.'

  override requiresPhase(phase: GamePhase): boolean {
    return phase === 'reacting'
  }

  override getRequiredSteps(phase: GamePhase): UIStep[] {
    if (phase === 'reacting') {
      return ['select_reaction']
    }
    return super.getRequiredSteps(phase)
  }

  override onBeforeMoveExecution(
    ctx: BeforeMoveExecutionCtx,
    executeMove: boolean
  ): boolean {
    if (!executeMove) return false

    // Read the reaction decision directly from the composite turn data.
    // myPlan holds the planning-phase plan (movement destination); the reaction
    // is a separate phase submission stored in myTurnData.reaction.
    const reactionPlan = ctx.myTurnData.reaction
    if (reactionPlan && reactionPlan.type === 'reaction') {
      return (reactionPlan as ReactionPlan).executeMove
    }

    return executeMove
  }
}
