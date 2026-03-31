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

export interface MatchSettings {
  maxTurns: number
  chaserPlayer: 1 | 2
  chaserPower: PowerName
  evaderPower: PowerName
}

export type PowerName =
  | 'Standard'
  | 'Vault'
  | 'Juke'
  | 'Line'
  | 'Idle'
  | 'Climber'
  | 'Declarer'

export type GamePhase = 'declaring' | 'planning' | 'reacting' | 'resolving'

// --- Discriminated Union for Turn Plans ---
export interface BasePlan {
  type: string
  turn: number
  phase: GamePhase
}

export interface StandardPlan extends BasePlan {
  type: 'standard'
  moveDest: HexCoord
  predictDest: HexCoord
  bonusMove?: HexCoord
}

export interface LinePlan extends BasePlan {
  type: 'line'
  moveDest: [HexCoord, HexCoord]
  predictDest: HexCoord
  bonusMove?: HexCoord
}

export interface IdlePlan extends BasePlan {
  type: 'idle'
  moveDest: null
  predictDest?: HexCoord
  bonusMove?: HexCoord
}

export interface DeclarationPlan extends BasePlan {
  type: 'declaration'
  declaredDest: HexCoord
}

export interface ReactionPlan extends BasePlan {
  type: 'reaction'
  executeMove: boolean
}

export type TurnPlan =
  | StandardPlan
  | LinePlan
  | IdlePlan
  | DeclarationPlan
  | ReactionPlan

// --- State Machine & UI Data ---
export type UIStep =
  | 'select_declaration'
  | 'select_movement_1'
  | 'select_movement_2'
  | 'select_prediction'
  | 'select_bonus'
  | 'select_reaction'
  | 'idle_confirmation'

export interface TurnSchema {
  requiredSteps: UIStep[]
  allowObstacleTargeting?: boolean
  allowSelfTargeting?: boolean
}

export interface Modifier {
  role: Role
  effect: 'range_3' // Expand this as we add more status effects
  expiresAtTurn: number
}

export interface TransientContext {
  chaserDeclaration?: HexCoord | null
  evaderDeclaration?: HexCoord | null
  chaserUnmaskedMove?: HexCoord | [HexCoord, HexCoord] | null // For Juke Reacting phase
  evaderUnmaskedMove?: HexCoord | [HexCoord, HexCoord] | null
}

/** Aggregates all plans submitted across a single turn's phases. */
export interface PlayerTurnData {
  declaration?: TurnPlan
  planning?: TurnPlan
  reaction?: TurnPlan
}

export interface ResolutionSummary {
  chaserPredHit: boolean
  evaderPredHit: boolean
  chaserBonusUsed: boolean
  evaderBonusUsed: boolean
  chaserLineHit?: boolean // If the opponent predicted either of Line's hexes
  evaderLineHit?: boolean
  chaserMoveAborted?: boolean // Vault/Juke outcomes
  evaderMoveAborted?: boolean
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

  chaserPower: PowerName
  evaderPower: PowerName
  modifiers: Modifier[]
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
