export interface HexCoord {
  q: number
  r: number
}

export type Role = 'chaser' | 'evader'

export type PredictionQuality = 'none' | 'partial' | 'full'

export interface GameSettings {
  gridType: 'hex' | 'square'
  moveSteps: 1 | 2
  predictionTarget: 'direction' | 'destination'
  /** freeze-both: correct prediction freezes opponent. bonus-both: correct prediction unlocks your own bonus move. freeze-and-bonus: chaser freezes evader, evader unlocks bonus move. */
  predictionOutcome: 'freeze-both' | 'bonus-both' | 'freeze-and-bonus'
}

export const DEFAULT_SETTINGS: GameSettings = {
  gridType: 'hex',
  moveSteps: 2,
  predictionTarget: 'direction',
  predictionOutcome: 'freeze-both',
}

/** A submitted plan for one turn. */
export interface TurnPlan {
  moveStep1: HexCoord
  moveStep2?: HexCoord      // absent in 1-step mode
  predictStep1: HexCoord
  predictStep2?: HexCoord   // absent in 1-step mode
  bonusMove?: HexCoord      // bonus-both: both players; freeze-and-bonus: evader only; executed only if prediction hit
}

export interface ResolutionSummary {
  chaserPredQuality: PredictionQuality
  evaderPredQuality: PredictionQuality
  chaserCancelledSteps: [boolean, boolean]
  evaderCancelledSteps: [boolean, boolean]
  chaserBonusUsed?: boolean  // bonus-both mode only
  evaderBonusUsed?: boolean  // bonus-both and freeze-and-bonus modes
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
  settings: GameSettings
}

export type ConnectionStatus =
  | 'connecting'
  | 'waiting_for_partner'
  | 'waiting_for_level'
  | 'playing'
  | 'disconnected'
  | 'error'
