import { BasePower } from './IAthletePower'
import type { PowerName } from '../../types'

export class StandardPower extends BasePower {
  readonly name: PowerName = 'Standard'
}
