import type { PowerName } from '../../types'
import { IAthletePower } from './IAthletePower'
import { StandardPower } from './Standard'
import { VaultPower } from './Vault'
import { JukePower } from './Juke'
import { LinePower } from './Line'
import { IdlePower } from './Idle'
import { ClimberPower } from './Climber'
import { DeclarerPower } from './Declarer'

export function getPowerStrategy(name: PowerName): IAthletePower {
  switch (name) {
    case 'Standard':
      return new StandardPower()
    case 'Vault':
      return new VaultPower()
    case 'Juke':
      return new JukePower()
    case 'Line':
      return new LinePower()
    case 'Idle':
      return new IdlePower()
    case 'Climber':
      return new ClimberPower()
    case 'Declarer':
      return new DeclarerPower()
    default:
      return new StandardPower()
  }
}
