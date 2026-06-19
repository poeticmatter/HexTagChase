import type { MatchSettings } from '../types'

/** Network transport for a player-vs-player game. */
export type Transport = 'live' | 'async'

/**
 * Raw user preferences captured by the Lobby form.
 */
export interface LobbySettings {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  baseMovement: 1 | 2
  mapId: string
  transport: Transport
}

/**
 * Converts raw lobby preferences into a fully-resolved, immutable MatchSettings struct.
 * This is the single entry point for the game creation pipeline.
 */
export function resolveMatchSettings(lobby: LobbySettings): MatchSettings {
  return {
    maxTurns: lobby.maxTurns,
    chaserPlayer: lobby.hostRole === 'Chaser' ? 1 : 2,
    baseMovement: lobby.baseMovement,
    mapId: lobby.mapId,
  }
}
