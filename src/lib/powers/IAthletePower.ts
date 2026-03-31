import type {
  GameState,
  TurnPlan,
  HexCoord,
  Role,
  PowerName,
  Modifier,
  PlayerTurnData,
} from '../../types'

export interface ReachableDestinationsCtx {
  state: GameState
  pos: HexCoord
  role: Role
  blocked: Set<string>
  walls: Set<string>
}

export interface BeforeMoveExecutionCtx {
  state: GameState
  role: Role
  myPlan: TurnPlan
  oppPlan: TurnPlan
  myTurnData: PlayerTurnData
  oppTurnData: PlayerTurnData
}

export interface PathExecutionCtx {
  state: GameState
  role: Role
  startPos: HexCoord
  targetDest: HexCoord | [HexCoord, HexCoord] | null
  blocked: Set<string>
  walls: Set<string>
  myPlan: TurnPlan
  oppPlan: TurnPlan
}

export interface BonusCalculationCtx {
  state: GameState
  role: Role
  myPlan: TurnPlan
  oppPlan: TurnPlan
  predHit: boolean // true if this player's prediction was correct
  oppPredHit: boolean // true if the opponent's prediction was correct
}

export interface BonusResult {
  selfBonusAllowed: boolean
  nullifyOpponentBonus: boolean
}

import type { UIStep } from '../../types'

export interface IAthletePower {
  readonly name: PowerName
  readonly description: string

  /** Returns true if this power requires a given phase. */
  requiresPhase(phase: GameState['phase']): boolean

  /** Returns the specific UI Steps required by this power during the given phase. */
  getRequiredSteps(phase: GameState['phase']): UIStep[]

  /** Modifies the pathfinding rules (e.g., Idle expanding range to 3, Climber traversing obstacles). */
  onReachableDestinationsRequest(
    ctx: ReachableDestinationsCtx,
    baseDestinations: HexCoord[]
  ): HexCoord[]

  /** Evaluates pre-movement conditions (e.g., Vault aborting on predicted landing). */
  onBeforeMoveExecution(
    ctx: BeforeMoveExecutionCtx,
    executeMove: boolean
  ): boolean

  /** Alters physical traversal (e.g., Climber, Line). Returns the path visited. */
  onPathExecution(
    ctx: PathExecutionCtx,
    defaultPath: HexCoord[]
  ): HexCoord[]

  /** Intercepts and modifies the rules for awarding bonus moves (e.g., Declarer, Line). */
  onBonusCalculation(
    ctx: BonusCalculationCtx,
    bonusAllowed: boolean
  ): BonusResult

  /** Called at the end of the round to persist state (e.g., Idle adding a range buff). */
  onRoundEnd(state: GameState, role: Role, myPlan: TurnPlan): Modifier[]
}

export abstract class BasePower implements IAthletePower {
  abstract readonly name: PowerName
  abstract readonly description: string

  requiresPhase(phase: GameState['phase']): boolean {
    return false
  }

  getRequiredSteps(phase: GameState['phase']): UIStep[] {
    if (phase === 'planning') {
      return ['select_movement_1', 'select_prediction', 'select_bonus']
    }
    return []
  }

  onReachableDestinationsRequest(
    ctx: ReachableDestinationsCtx,
    baseDestinations: HexCoord[]
  ): HexCoord[] {
    return baseDestinations
  }

  onBeforeMoveExecution(
    ctx: BeforeMoveExecutionCtx,
    executeMove: boolean
  ): boolean {
    return executeMove
  }

  onPathExecution(
    ctx: PathExecutionCtx,
    defaultPath: HexCoord[]
  ): HexCoord[] {
    return defaultPath
  }

  onBonusCalculation(
    ctx: BonusCalculationCtx,
    bonusAllowed: boolean
  ): BonusResult {
    return { selfBonusAllowed: bonusAllowed, nullifyOpponentBonus: false }
  }

  onRoundEnd(state: GameState, role: Role, myPlan: TurnPlan): Modifier[] {
    return []
  }
}
