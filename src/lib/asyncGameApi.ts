import type { MatchSettings, GameState, TurnPlan } from '../types'
import { buildInitialState, buildNextRoundState, processPhase } from './hexGameLogic'
import { getSupabase } from './supabaseClient'

/**
 * Database I/O for asynchronous play. This module is pure transport plus the
 * resolve-orchestration that the live host normally does in memory — all game rules
 * stay in hexGameLogic.ts.
 *
 * Error policy: every Supabase call's `error` is thrown upward; useHexGameAsync is the
 * handling boundary that maps failures to ConnectionStatus. The one exception is a
 * missing row on {@link loadGame}, which is normal control flow and returns null.
 */

const TABLE = 'games'

/** Shape of a row in the `games` table. */
export interface GameRow {
  id: string
  settings: MatchSettings
  state: GameState
  p1_plan: TurnPlan | null
  p2_plan: TurnPlan | null
  p2_joined: boolean
}

/** Creates the game row from resolved settings and returns the initial state. */
export async function createGame(code: string, settings: MatchSettings): Promise<GameState> {
  const state = buildInitialState(settings)

  const { error } = await getSupabase()
    .from(TABLE)
    .insert({ id: code, settings, state, p2_joined: false })

  if (error) throw error
  return state
}

/** Loads a game by room code. Returns null when no such room exists. */
export async function loadGame(code: string): Promise<GameRow | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', code)
    .maybeSingle()

  if (error) throw error
  return (data as GameRow | null) ?? null
}

/** Marks the evader as present so the host can advance from waiting to playing. */
export async function joinGameAsPlayer2(code: string): Promise<void> {
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ p2_joined: true })
    .eq('id', code)

  if (error) throw error
}

/**
 * Commits a player's plan for the current turn, then resolves the turn if both plans
 * are now present.
 *
 * The plan write and the resolve write are both guarded on the stored `state.turn`, so
 * a stale submission (the board already moved on) is a no-op, and two clients racing to
 * resolve the same turn produce identical deterministic state with the loser's write
 * matching zero rows.
 */
export async function submitPlan(code: string, role: 1 | 2, plan: TurnPlan): Promise<void> {
  const planColumn = role === 1 ? 'p1_plan' : 'p2_plan'

  const { error: writeError } = await getSupabase()
    .from(TABLE)
    .update({ [planColumn]: plan })
    .eq('id', code)
    .eq('state->>turn', plan.turn)

  if (writeError) throw writeError

  const row = await loadGame(code)
  if (!row) return

  const bothCommitted = row.p1_plan !== null && row.p2_plan !== null
  const turnUnchanged = row.state.turn === plan.turn
  if (!bothCommitted || !turnUnchanged) return

  const nextState = processPhase(row.state, row.p1_plan, row.p2_plan)

  const { error: resolveError } = await getSupabase()
    .from(TABLE)
    .update({
      state: nextState,
      p1_plan: null,
      p2_plan: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', code)
    .eq('state->>turn', plan.turn)

  if (resolveError) throw resolveError
}

/**
 * Advances to the next round. Guarded on the finished round number so a simultaneous
 * press from both players advances exactly once.
 */
export async function startNextRound(code: string, currentRound: number): Promise<void> {
  const row = await loadGame(code)
  if (!row) return

  const nextState = buildNextRoundState(row.state)

  const { error } = await getSupabase()
    .from(TABLE)
    .update({ state: nextState, updated_at: new Date().toISOString() })
    .eq('id', code)
    .eq('state->matchState->>roundNumber', currentRound)

  if (error) throw error
}
