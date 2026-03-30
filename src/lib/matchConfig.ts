import type { MatchSettings, PowerName } from '../types'

export type PowerSelection = PowerName | 'Random'

export const ALL_POWERS: PowerName[] = [
  'Standard', 'Vault', 'Juke', 'Line', 'Idle', 'Climber', 'Declarer',
]

export const POWER_OPTIONS: PowerSelection[] = ['Random', ...ALL_POWERS]

/**
 * Raw user preferences captured by the Lobby form.
 * Powers may be 'Random' — not yet resolved to concrete PowerNames.
 */
export interface LobbySettings {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  chaserPowerSelection: PowerSelection
  evaderPowerSelection: PowerSelection
}

function pickRandom(pool: PowerName[]): PowerName {
  return pool[Math.floor(Math.random() * pool.length)]
}

function pickTwoDistinct(): [PowerName, PowerName] {
  const pool = [...ALL_POWERS]
  const firstIndex = Math.floor(Math.random() * pool.length)
  const [first] = pool.splice(firstIndex, 1)
  const second = pickRandom(pool)
  return [first, second]
}

/**
 * Resolves 'Random' power selections into concrete PowerNames.
 * When both sides are Random, uniqueness is enforced.
 * Pure function — no DOM or React dependencies.
 */
function resolveRandomPowers(
  chaserSelection: PowerSelection,
  evaderSelection: PowerSelection,
): { chaserPower: PowerName; evaderPower: PowerName } {
  if (chaserSelection !== 'Random' && evaderSelection !== 'Random') {
    return { chaserPower: chaserSelection, evaderPower: evaderSelection }
  }
  if (chaserSelection !== 'Random' && evaderSelection === 'Random') {
    return {
      chaserPower: chaserSelection,
      evaderPower: pickRandom(ALL_POWERS.filter(p => p !== chaserSelection)),
    }
  }
  if (chaserSelection === 'Random' && evaderSelection !== 'Random') {
    return {
      chaserPower: pickRandom(ALL_POWERS.filter(p => p !== evaderSelection)),
      evaderPower: evaderSelection,
    }
  }
  const [chaserPower, evaderPower] = pickTwoDistinct()
  return { chaserPower, evaderPower }
}

/**
 * Converts raw lobby preferences into a fully-resolved, immutable MatchSettings struct.
 * This is the single entry point for the game creation pipeline.
 */
export function resolveMatchSettings(lobby: LobbySettings): MatchSettings {
  const chaserPlayer: 1 | 2 = lobby.hostRole === 'Chaser' ? 1 : 2

  const { chaserPower, evaderPower } = resolveRandomPowers(
    lobby.chaserPowerSelection,
    lobby.evaderPowerSelection,
  )

  return { maxTurns: lobby.maxTurns, chaserPlayer, chaserPower, evaderPower }
}
