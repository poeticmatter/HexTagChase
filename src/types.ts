export interface HexCoord {
  q: number
  r: number
}

export type Role = 'chaser' | 'evader'

export type PredictionQuality = 'none' | 'partial' | 'full'

/** A submitted plan for one turn: 2-step move + prediction of opponent's 2-step move. */
export interface TurnPlan {
  moveStep1: HexCoord
  moveStep2: HexCoord
  predictStep1: HexCoord
  predictStep2: HexCoord
}

export interface ResolutionSummary {
  chaserPredQuality: PredictionQuality          // chaser predicting evader
  evaderPredQuality: PredictionQuality          // evader predicting chaser
  chaserCancelledSteps: [boolean, boolean]      // which of chaser's steps were cancelled (by evader's prediction)
  evaderCancelledSteps: [boolean, boolean]      // which of evader's steps were cancelled (by chaser's prediction)
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
