export interface HexCoord {
  q: number
  r: number
}

/** A wall blocking the passage between two adjacent cells (stored as a normalized pair). */
export interface WallCoord {
  q1: number; r1: number
  q2: number; r2: number
}

export type Role = 'chaser' | 'evader'

export const MAX_TURNS = 15
export const HOST_ROLE = 'chaser'
export const OBSTACLE_MODE = 'both'

/** A submitted plan for one turn. */
export interface TurnPlan {
  moveDest: HexCoord
  predictDest: HexCoord
  bonusMove?: HexCoord
}

export interface ResolutionSummary {
  chaserPredHit: boolean
  evaderPredHit: boolean
  chaserBonusUsed: boolean
  evaderBonusUsed: boolean
}

export interface GameState {
  chaserPos: HexCoord
  evaderPos: HexCoord
  prevChaserPath: HexCoord[] | null  // positions visited each step (not including start)
  prevEvaderPath: HexCoord[] | null
  phase: 'planning'
  turn: number
  winner: Role | null
  obstacles: HexCoord[]
  walls: WallCoord[]
  p1Plan: TurnPlan | null   // p1 = chaser
  p2Plan: TurnPlan | null   // p2 = evader
  lastResolution: ResolutionSummary | null
}

export type ConnectionStatus =
  | 'connecting'
  | 'waiting_for_partner'
  | 'waiting_for_level'
  | 'playing'
  | 'disconnected'
  | 'error'
