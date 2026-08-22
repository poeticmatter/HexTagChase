export interface HexCoord {
  q: number
  r: number
}

export interface WallCoord {
  q1: number; r1: number
  q2: number; r2: number
}

// ── Map rules ─────────────────────────────────────────────────────────────────

/** When a player leaves a hex, it collapses into a pit (elevation -1). */
export interface CrumblingHexRule {
  type: 'crumbling_hex'
}

export type MapRule = CrumblingHexRule

export type Role = 'chaser' | 'evader'

export interface MapDefinition {
  id: string
  name: string
  chaserStart: HexCoord
  evaderStart: HexCoord
  obstacles: HexCoord[]
  elevations?: Record<string, number>
  walls: WallCoord[]
  rules?: MapRule[]
}

export interface MatchSettings {
  chaserPlayer: 1 | 2
  mapId: string
  /** Starting size of the evader's movement pool. Chaser gets startingMovementPoints + 5. */
  startingMovementPoints: number
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

export interface DraftPlan {
  moveDest: HexCoord | null
  movePath: HexCoord[] | null
  predictDest: HexCoord | null
}

export interface SpectatorDrafts {
  chaserDraft: DraftPlan | null
  evaderDraft: DraftPlan | null
}

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
  rules: MapRule[]
  p1Budget: number
  p2Budget: number
  transientContext: TransientContext
  turnSchema: Record<Role, TurnSchema>
  p1TurnData: PlayerTurnData
  p2TurnData: PlayerTurnData
  lastResolution: ResolutionSummary | null
  objectives: HexCoord[]
  objectivesCollected: number
  lastCollectedObjective: HexCoord | null
}

export type UserRole = 1 | 2 | 'spectator'

export type ConnectionStatus =
  | 'connecting'
  | 'waiting_for_partner'
  | 'waiting_for_level'
  | 'playing'
  | 'spectating'
  | 'reconnecting'
  | 'disconnected'
  | 'error'
