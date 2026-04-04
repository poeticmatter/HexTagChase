export interface HexCoord {
  q: number
  r: number
}

export interface WallCoord {
  q1: number; r1: number
  q2: number; r2: number
}

export type Role = 'chaser' | 'evader'

export interface MapDefinition {
  id: string
  name: string
  chaserStart: HexCoord
  evaderStart: HexCoord
  obstacles: HexCoord[]
  elevations?: Record<string, number>
  walls: WallCoord[]
}

export interface MatchSettings {
  maxTurns: number
  chaserPlayer: 1 | 2
  baseMovement: 1 | 2
  mapId: string
}

// ── Symmetrical turn plans ─────────────────────────────────────────────────────

export interface ChaserPlan {
  type: 'chaser'
  turn: number
  moveDest: HexCoord
  movePath: HexCoord[]
  predictDest: HexCoord
}

export interface EvaderPlan {
  type: 'evader'
  turn: number
  moveDest: HexCoord
  movePath: HexCoord[]
  predictDest: HexCoord
}

export type TurnPlan = ChaserPlan | EvaderPlan

// ── State machine & UI ────────────────────────────────────────────────────────

export type UIStep =
  | 'select_movement'
  | 'select_prediction'

export interface TurnSchema {
  requiredSteps: UIStep[]
}

export interface TransientContext {
}

export interface PlayerTurnData {
  planning?: TurnPlan
  bonus?: TurnPlan
}

export interface ResolutionSummary {
  chaserPredHit: boolean
  evaderPredHit: boolean
}

export interface MatchState {
  roundNumber: number
  history: (1 | 2)[]
  matchWinner: 1 | 2 | null
}

export interface GameState {
  settings: MatchSettings
  matchState: MatchState
  chaserPos: HexCoord
  evaderPos: HexCoord
  prevChaserPath: HexCoord[] | null
  prevEvaderPath: HexCoord[] | null
  turn: number
  winner: Role | null
  obstacles: HexCoord[]
  elevations: Record<string, number>
  walls: WallCoord[]
  p1Budget: number
  p2Budget: number
  transientContext: TransientContext
  turnSchema: Record<Role, TurnSchema>
  p1TurnData: PlayerTurnData
  p2TurnData: PlayerTurnData
  lastResolution: ResolutionSummary | null
}

export type ConnectionStatus =
  | 'connecting'
  | 'waiting_for_partner'
  | 'waiting_for_level'
  | 'playing'
  | 'reconnecting'
  | 'disconnected'
  | 'error'
