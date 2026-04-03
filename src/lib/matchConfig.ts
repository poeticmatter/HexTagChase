import type { MatchSettings, BonusTiming } from '../types'

export type { BonusTiming }

export const BONUS_TIMING_OPTIONS: BonusTiming[] = ['pre-commit', 'post-reveal']

/**
 * Raw user preferences captured by the Lobby form.
 */
export interface LobbySettings {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  bonusTiming: BonusTiming
  mapId: string
}

/**
 * Converts raw lobby preferences into a fully-resolved, immutable MatchSettings struct.
 * This is the single entry point for the game creation pipeline.
 */
export function resolveMatchSettings(lobby: LobbySettings): MatchSettings {
  return {
    maxTurns: lobby.maxTurns,
    chaserPlayer: lobby.hostRole === 'Chaser' ? 1 : 2,
    bonusTiming: lobby.bonusTiming,
    mapId: lobby.mapId,
  }
}
