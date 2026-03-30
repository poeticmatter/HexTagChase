import { BasePower, BeforeMoveExecutionCtx } from './IAthletePower'
import type { GamePhase, PowerName, ReactionPlan } from '../../types'

export class JukePower extends BasePower {
  readonly name: PowerName = 'Juke'

  override requiresPhase(phase: GamePhase): boolean {
    return phase === 'reacting'
  }

  override onBeforeMoveExecution(
    ctx: BeforeMoveExecutionCtx,
    executeMove: boolean
  ): boolean {
    if (!executeMove) return false

    // The reacting plan is stored in transientContext because `myPlan` holds the original
    // planning plan (which has the movement destination we are evaluating).
    const reactionPlan = ctx.role === 'chaser'
      ? ctx.state.transientContext.chaserReactionPlan
      : ctx.state.transientContext.evaderReactionPlan

    if (reactionPlan && reactionPlan.type === 'reaction') {
      return (reactionPlan as ReactionPlan).executeMove
    }

    return executeMove
  }
}
