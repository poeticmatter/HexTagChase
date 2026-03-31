export interface HexCoord {
  q: number
  r: number
}

export interface WallCoord {
  q1: number; r1: number
  q2: number; r2: number
}

export type Role = 'chaser' | 'evader'

export const OBSTACLE_MODE = 'both'

export type BonusTiming = 'pre-commit' | 'post-reveal'

export interface MatchSettings {
  maxTurns: number
  chaserPlayer: 1 | 2
  bonusTiming: BonusTiming
}

export type GamePhase = 'planning' | 'bonus_phase'

// ── Asymmetric turn plans ─────────────────────────────────────────────────────

/** Chaser's planning-phase plan: move + prediction + optional pre-committed bonus. */
export interface ChaserPlan {
  type: 'chaser'
  turn: number
  phase: GamePhase
  moveDest: HexCoord
  predictDest: HexCoord
  bonusMove?: HexCoord
}

/** Evader's planning-phase plan: move only + optional pre-committed bonus. */
export interface EvaderPlan {
  type: 'evader'
  turn: number
  phase: GamePhase
  moveDest: HexCoord
  bonusMove?: HexCoord
}

/** Post-reveal bonus phase: the entitled player selects their bonus move (null = skip). */
export interface BonusPlan {
  type: 'bonus'
  turn: number
  phase: 'bonus_phase'
  bonusMove: HexCoord | null
}

export type TurnPlan = ChaserPlan | EvaderPlan | BonusPlan

// ── State machine & UI ────────────────────────────────────────────────────────

export type UIStep =
  | 'select_movement'
  | 'select_prediction'
  | 'select_bonus'

export interface TurnSchema {
  requiredSteps: UIStep[]
}

export interface TransientContext {
  /** post-reveal: which role submits the bonus plan in bonus_phase */
  bonusEntitledRole?: Role
  /** post-reveal: cached for bonus_phase resolution */
  chaserPredHit?: boolean
  /** post-reveal: committed movement paths (include start pos as first element) */
  committedChaserPath?: HexCoord[] | null
  committedEvaderPath?: HexCoord[] | null
}

export interface PlayerTurnData {
  planning?: TurnPlan
  bonus?: TurnPlan
}

export interface ResolutionSummary {
  chaserPredHit: boolean
  bonusUsedBy: Role | null
}

export interface GameState {
  settings: MatchSettings
  chaserPos: HexCoord
  evaderPos: HexCoord
  prevChaserPath: HexCoord[] | null
  prevEvaderPath: HexCoord[] | null
  phase: GamePhase
  turn: number
  winner: Role | null
  obstacles: HexCoord[]
  walls: WallCoord[]
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
  | 'disconnected'
  | 'error'
