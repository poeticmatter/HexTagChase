import { SimulationConfig, SimulationResult, HexSimStats } from './simulationTypes'
import { MatchSettings, GameState, Role } from '../types'
import { buildInitialState, processPhase } from './hexGameLogic'
import { produceTurnPlan } from './simulationAgent'

export function runSimulation(
  config: SimulationConfig,
  onProgress?: (completed: number) => void
): SimulationResult {
  const startTime = Date.now()
  const settings: MatchSettings = {
    mapId: config.mapId,
    baseMovement: config.baseMovement,
    maxTurns: config.maxTurns,
    chaserPlayer: 1, // Doesn't matter for symmetric simulation
  }

  let chaserWins = 0
  let evaderWins = 0
  const gameLengthDistribution: number[] = Array(config.maxTurns + 1).fill(0)

  let totalChaserPreds = 0
  let totalChaserPredHits = 0
  let totalEvaderPreds = 0
  let totalEvaderPredHits = 0

  const hexStats: Record<string, HexSimStats> = {}

  for (let i = 0; i < config.iterations; i++) {
    let state = buildInitialState(settings)

    // Arrays to record landings for this specific game
    const gameChaserLandings: string[] = []
    const gameEvaderLandings: string[] = []

    while (state.winner === null && state.turn <= config.maxTurns) {
      const chaserPlan = produceTurnPlan(config.chaserStrategy, state, 'chaser')
      const evaderPlan = produceTurnPlan(config.evaderStrategy, state, 'evader')

      // Record intended landing hexes before resolution
      gameChaserLandings.push(`${chaserPlan.moveDest.q},${chaserPlan.moveDest.r}`)
      gameEvaderLandings.push(`${evaderPlan.moveDest.q},${evaderPlan.moveDest.r}`)

      const nextState = processPhase(state, chaserPlan, evaderPlan)

      // Accumulate prediction stats
      if (nextState.lastResolution) {
        totalChaserPreds++
        if (nextState.lastResolution.chaserPredHit) totalChaserPredHits++
        totalEvaderPreds++
        if (nextState.lastResolution.evaderPredHit) totalEvaderPredHits++
      }

      state = nextState
    }

    // Process game results
    const winner = state.winner ?? 'evader' // If maxTurns reached and no winner, evader wins
    const gameLength = state.turn - 1 // turn advanced one past the end

    if (winner === 'chaser') chaserWins++
    else evaderWins++

    // Safety check for game length distribution array bounds
    const clampLength = Math.min(gameLength, config.maxTurns)
    gameLengthDistribution[clampLength]++

    // Update hex stats based on game winner
    const chaserWon = winner === 'chaser'

    for (const hex of gameChaserLandings) {
      if (!hexStats[hex]) initHexStats(hexStats, hex)
      hexStats[hex].chaserLandings++
      if (chaserWon) hexStats[hex].chaserLandingsOnChaserWin++
      else hexStats[hex].chaserLandingsOnEvaderWin++
    }

    for (const hex of gameEvaderLandings) {
      if (!hexStats[hex]) initHexStats(hexStats, hex)
      hexStats[hex].evaderLandings++
      if (chaserWon) hexStats[hex].evaderLandingsOnChaserWin++
      else hexStats[hex].evaderLandingsOnEvaderWin++
    }

    if (onProgress && (i + 1) % 100 === 0) {
      onProgress(i + 1)
    }
  }

  // Calculate averages
  let totalLengthSum = 0
  for (let len = 0; len < gameLengthDistribution.length; len++) {
    totalLengthSum += gameLengthDistribution[len] * len
  }
  const avgGameLength = totalLengthSum / config.iterations

  const chaserPredictionAccuracy = totalChaserPreds > 0 ? totalChaserPredHits / totalChaserPreds : 0
  const evaderPredictionAccuracy = totalEvaderPreds > 0 ? totalEvaderPredHits / totalEvaderPreds : 0

  return {
    totalGames: config.iterations,
    chaserWins,
    evaderWins,
    gameLengthDistribution,
    avgGameLength,
    chaserPredictionAccuracy,
    evaderPredictionAccuracy,
    hexStats,
    settings,
    durationMs: Date.now() - startTime
  }
}

function initHexStats(stats: Record<string, HexSimStats>, hex: string) {
  stats[hex] = {
    chaserLandings: 0,
    evaderLandings: 0,
    chaserLandingsOnChaserWin: 0,
    chaserLandingsOnEvaderWin: 0,
    evaderLandingsOnChaserWin: 0,
    evaderLandingsOnEvaderWin: 0
  }
}
