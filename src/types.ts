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

export type PredictionQuality = 'none' | 'partial' | 'full'

export interface GameSettings {
  gridType: 'hex' | 'square'
  moveSteps: 1 | 2
  predictionTarget: 'direction' | 'destination'
  /** freeze-both: correct prediction freezes opponent. bonus-both: correct prediction unlocks your own bonus move. freeze-and-bonus: chaser freezes evader, evader unlocks bonus move. */
  predictionOutcome: 'freeze-both' | 'bonus-both' | 'freeze-and-bonus'
  /** survive: evader wins by lasting maxTurns. collect: evader wins by collecting 4 of 6 fixed tokens. */
  evaderObjective: 'survive' | 'collect'
  /** Number of turns the evader must survive to win (survive mode only). */
  maxTurns: number
  /** Which role the host (player 1) plays. */
  hostRole: 'chaser' | 'evader'
  /** hexes: blocked cells. walls: impassable edges between cells. both: combination. */
  obstacleMode: 'hexes' | 'walls' | 'both'
}

export const DEFAULT_SETTINGS: GameSettings = {
  gridType: 'hex',
  moveSteps: 2,
  predictionTarget: 'destination',
  predictionOutcome: 'bonus-both',
  evaderObjective: 'survive',
  maxTurns: 15,
  hostRole: 'chaser',
  obstacleMode: 'hexes',
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
  walls: WallCoord[]
  p1Plan: TurnPlan | null   // p1 = chaser
  p2Plan: TurnPlan | null   // p2 = evader
  lastResolution: ResolutionSummary | null
  settings: GameSettings
  collectibleTokens: HexCoord[]  // remaining uncollected tokens (empty in survive mode)
  tokensCollected: number         // how many tokens the evader has collected
}

export type ConnectionStatus =
  | 'connecting'
  | 'waiting_for_partner'
  | 'waiting_for_level'
  | 'playing'
  | 'disconnected'
  | 'error'
