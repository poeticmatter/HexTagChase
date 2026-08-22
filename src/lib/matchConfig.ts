import type { MatchSettings } from '../types'

/** Network transport for a player-vs-player game. */
export type Transport = 'live' | 'async'

/**
 * Raw user preferences captured by the Lobby form.
 */
export interface LobbySettings {
  hostRole: 'Chaser' | 'Evader' | 'Spectator'
  mapId: string
  transport: Transport
  startingMovementPoints: number
}

/**
 * Converts raw lobby preferences into a fully-resolved, immutable MatchSettings struct.
 * This is the single entry point for the game creation pipeline.
 */
export function resolveMatchSettings(lobby: LobbySettings): MatchSettings {
  return {
    chaserPlayer: lobby.hostRole === 'Evader' ? 2 : 1,
    mapId: lobby.mapId,
    startingMovementPoints: lobby.startingMovementPoints,
  }
}
