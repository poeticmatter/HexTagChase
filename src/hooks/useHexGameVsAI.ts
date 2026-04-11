import { useState, useCallback } from 'react'
import type { GameState, TurnPlan, MatchSettings, Role } from '../types'
import { processPhase, buildNextRoundState, buildInitialState } from '../lib/hexGameLogic'
import { produceTurnPlan, type SimulationAgent } from '../lib/simulationAgent'

/**
 * Local single-player hook — no networking.
 *
 * The human is always player 1. The AI is always player 2. Which role each
 * player occupies (chaser vs evader) is determined by settings.chaserPlayer
 * and flips each round via buildNextRoundState, exactly as in PvP.
 */
export function useHexGameVsAI(settings: MatchSettings, aiStrategy: SimulationAgent) {
  const [gameState, setGameState] = useState<GameState>(() => buildInitialState(settings))

  const submitPlan = useCallback((humanPlan: TurnPlan) => {
    setGameState(current => {
      // Read the AI's current role from live state — it flips each round.
      const aiRole: Role = current.settings.chaserPlayer === 2 ? 'chaser' : 'evader'
      const aiPlan = produceTurnPlan(aiStrategy, current, aiRole)
      return processPhase(current, humanPlan, aiPlan)
    })
  }, [aiStrategy])

  const startNextRound = useCallback(() => {
    setGameState(current => buildNextRoundState(current))
  }, [])

  return { gameState, submitPlan, startNextRound }
}
