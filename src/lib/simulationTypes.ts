import { MatchSettings } from '../types'
import { SimulationAgent } from './simulationAgent'

export interface HexSimStats {
  chaserLandings: number
  evaderLandings: number
  chaserLandingsOnChaserWin: number
  chaserLandingsOnEvaderWin: number
  evaderLandingsOnChaserWin: number
  evaderLandingsOnEvaderWin: number
}

export interface SimulationResult {
  totalGames: number
  chaserWins: number
  evaderWins: number
  gameLengthDistribution: number[]
  avgGameLength: number
  chaserPredictionAccuracy: number
  evaderPredictionAccuracy: number
  hexStats: Record<string, HexSimStats>
  settings: MatchSettings
  durationMs: number
}

export interface SimulationConfig {
  mapId: string
  baseMovement: 1 | 2
  maxTurns: number
  iterations: number
  chaserStrategy: SimulationAgent
  evaderStrategy: SimulationAgent
}
