import { BasePower, BeforeMoveExecutionCtx } from './IAthletePower'
import type { PowerName, StandardPlan } from '../../types'

export class VaultPower extends BasePower {
  readonly name: PowerName = 'Vault'

  override onBeforeMoveExecution(
    ctx: BeforeMoveExecutionCtx,
    executeMove: boolean
  ): boolean {
    if (!executeMove) return false

    const myPlan = ctx.myPlan
    const oppPlan = ctx.oppPlan

    // Vault cancels movement if opponent predicted the landing spot
    if (myPlan.type === 'standard' && oppPlan.type === 'standard') {
      const { moveDest } = myPlan as StandardPlan
      const { predictDest } = oppPlan as StandardPlan

      if (moveDest && predictDest && moveDest.q === predictDest.q && moveDest.r === predictDest.r) {
        return false // Movement aborted
      }
    }

    return executeMove
  }
}
