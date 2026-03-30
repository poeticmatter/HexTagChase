import { BasePower } from './IAthletePower'
import type { PowerName } from '../../types'

export class StandardPower extends BasePower {
  readonly name: PowerName = 'Standard'
  readonly description = 'No special ability. Move up to 2 steps, predict your opponent\'s destination, and earn a bonus move on a correct prediction.'
}
