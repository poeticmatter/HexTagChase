import { useState, useCallback, useEffect, useMemo } from 'react'
import { useHexGame } from './hooks/useHexGame'
import { useHexGameAsync } from './hooks/useHexGameAsync'
import { useHexGameVsAI } from './hooks/useHexGameVsAI'
import { HexBoard } from './components/HexBoard'
import { PlanningPanel } from './components/PlanningPanel'
import type { DraftPlan } from './components/PlanningPanel'
import type { TurnSchema, UIStep } from './types'
import { Lobby } from './components/Lobby'
import { MapEditor } from './components/MapEditor'
import { SimulatorView } from './components/SimulatorView'
import type { HexCoord, TurnPlan, MatchSettings, GameState } from './types'
import { resolveMatchSettings } from './lib/matchConfig'
import type { LobbySettings, Transport } from './lib/matchConfig'
import { buildWallSet, reachableDestinations } from './lib/hexGameLogic'
import type { SimulationAgent } from './lib/simulationAgent'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Utility screens ───────────────────────────────────────────────────────────

function StatusScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-4">
      <p className="text-neutral-400 text-lg">{message}</p>
      <button
        onClick={() => { window.location.href = window.location.pathname }}
        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
      >
        Back to Lobby
      </button>
    </div>
  )
}

function ReconnectingScreen() {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-3">
      <p className="text-neutral-200 text-lg font-semibold">Connection lost</p>
      <p className="text-neutral-500 text-sm animate-pulse">Attempting to restore your session…</p>
    </div>
  )
}

function WaitingForPartner({
  roomCode,
  opponentRole,
  transport,
}: {
  roomCode: string
  opponentRole: string
  transport: Transport
}) {
  const base = `${window.location.origin}${window.location.pathname}?room=${roomCode}`
  const shareUrl = transport === 'async' ? `${base}&mode=async` : base
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-6">
      <h2 className="text-2xl font-semibold">Waiting for {opponentRole}…</h2>
      <p className="text-neutral-400 text-sm">Share this link with your opponent:</p>
      <div className="flex gap-2 items-center">
        <code className="bg-neutral-800 px-4 py-2 rounded-lg text-neutral-200 text-sm select-all">
          {shareUrl}
        </code>
        <button
          onClick={() => navigator.clipboard.writeText(shareUrl)}
          className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm transition-colors"
        >
          Copy
        </button>
      </div>
      <p className="text-neutral-600 text-xs font-mono">Room: {roomCode}</p>
    </div>
  )
}

// ── Planning state helpers ────────────────────────────────────────────────────

const EMPTY_DRAFT: DraftPlan = {
  moveDest: null,
  movePath: null,
  predictDest: null,
}

function getCurrentStep(draft: DraftPlan, schema: TurnSchema): UIStep | 'ready' {
  for (const step of schema.requiredSteps) {
    if (step === 'select_movement' && !draft.moveDest) return step
    if (step === 'select_prediction' && !draft.predictDest) return step
  }
  return 'ready'
}

function applyClick(
  draft: DraftPlan,
  hex: HexCoord,
  schema: TurnSchema,
  cachedMovePaths: Map<string, HexCoord[]>,
): DraftPlan {
  const step = getCurrentStep(draft, schema)
  switch (step) {
    case 'select_movement': {
      const path = cachedMovePaths.get(`${hex.q},${hex.r}`) ?? []
      return { ...draft, moveDest: hex, movePath: path }
    }
    case 'select_prediction': return { ...draft, predictDest: hex }
    case 'ready':             return draft
  }
}

// ── Active game board ─────────────────────────────────────────────────────────
//
// Shared rendering for both PvP and vs-AI modes. Accepts the resolved game
// state and action callbacks so it has no knowledge of the transport layer.

interface ActiveGameProps {
  gameState: GameState
  playerRole: 1 | 2
  waitingForPartner: boolean
  /** Whether the "Start Next Round" button is available to this player. */
  canStartNextRound: boolean
  submitPlan: (plan: TurnPlan) => void
  startNextRound: () => void
}

function ActiveGame({
  gameState,
  playerRole,
  waitingForPartner,
  canStartNextRound,
  submitPlan,
  startNextRound,
}: ActiveGameProps) {
  const [draft, setDraft] = useState<DraftPlan>(EMPTY_DRAFT)
  const [showCoords, setShowCoords] = useState(false)
  const [objectiveFlash, setObjectiveFlash] = useState(false)

  const handleConfirm = useCallback((plan: TurnPlan) => {
    submitPlan(plan)
  }, [submitPlan])

  const handleReset = useCallback(() => {
    setDraft(EMPTY_DRAFT)
  }, [])

  // Reset draft whenever the turn advances.
  useEffect(() => {
    setDraft(EMPTY_DRAFT)
  }, [gameState.turn])

  // Flash notification whenever an objective is collected.
  useEffect(() => {
    if (gameState.objectivesCollected === 0) return
    setObjectiveFlash(true)
    const t = setTimeout(() => setObjectiveFlash(false), 2000)
    return () => clearTimeout(t)
  }, [gameState.objectivesCollected])

  const isChaser         = gameState.settings.chaserPlayer === playerRole
  const roleKey          = isChaser ? 'chaser' : 'evader'
  const schema: TurnSchema = gameState.turnSchema[roleKey]
  const currentStep      = getCurrentStep(draft, schema)
  const effectiveWaiting = waitingForPartner || schema.requiredSteps.length === 0

  const topology = useMemo(() => ({
    wallKeys: buildWallSet(gameState.walls),
  }), [gameState.walls, gameState.obstacles])

  const cachedMovePaths = useMemo<Map<string, HexCoord[]>>(() => {
    if (effectiveWaiting || gameState.winner) return new Map()
    const myPos    = isChaser ? gameState.chaserPos : gameState.evaderPos
    const myBudget = playerRole === 1 ? gameState.p1Budget : gameState.p2Budget
    return reachableDestinations(myPos, gameState.elevations, topology.wallKeys, myBudget)
  }, [gameState, topology, effectiveWaiting, isChaser, playerRole])

  const cachedPredictPaths = useMemo<Map<string, HexCoord[]>>(() => {
    if (effectiveWaiting || gameState.winner) return new Map()
    const opponentPos    = isChaser ? gameState.evaderPos  : gameState.chaserPos
    const opponentBudget = playerRole === 1 ? gameState.p2Budget : gameState.p1Budget
    return reachableDestinations(opponentPos, gameState.elevations, topology.wallKeys, opponentBudget)
  }, [gameState, topology, effectiveWaiting, isChaser])

  const cachedMoveTargets    = useMemo(() => new Set(cachedMovePaths.keys()),    [cachedMovePaths])
  const cachedPredictTargets = useMemo(() => new Set(cachedPredictPaths.keys()), [cachedPredictPaths])

  const handleHexClick = useCallback((hex: HexCoord) => {
    setDraft(prev => {
      const isChaserLocal = gameState.settings.chaserPlayer === playerRole
      const schemaLocal   = gameState.turnSchema[isChaserLocal ? 'chaser' : 'evader']
      return applyClick(prev, hex, schemaLocal, cachedMovePaths)
    })
  }, [gameState, playerRole, cachedMovePaths])

  const validTargets = useMemo<Set<string>>(() => {
    if (effectiveWaiting || gameState.winner) return new Set()
    switch (currentStep) {
      case 'select_movement':   return cachedMoveTargets
      case 'select_prediction': return cachedPredictTargets
      case 'ready':             return new Set()
    }
  }, [effectiveWaiting, currentStep, cachedMoveTargets, cachedPredictTargets, gameState.winner])

  const maxTurns         = gameState.settings.maxTurns
  const myPos            = isChaser ? gameState.chaserPos    : gameState.evaderPos
  const opponentPos      = isChaser ? gameState.evaderPos    : gameState.chaserPos
  const prevMyPath       = isChaser ? gameState.prevChaserPath : gameState.prevEvaderPath
  const prevOpponentPath = isChaser ? gameState.prevEvaderPath : gameState.prevChaserPath

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-4 p-4 font-sans">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <h1 className="text-2xl font-bold tracking-tight">Hex Tag</h1>
        <span className="text-neutral-500 text-sm">
          Turn {Math.min(gameState.turn, maxTurns)} / {maxTurns}
        </span>
        {gameState.settings.winCondition === 'collect_objectives' && (
          <span className="text-amber-400 text-sm font-semibold">
            {gameState.objectivesCollected} / {gameState.settings.objectivesTarget} objectives
          </span>
        )}
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
          isChaser
            ? 'bg-red-900/50 text-red-400 border-red-800'
            : 'bg-blue-900/50 text-blue-400 border-blue-800'
        }`}>
          {isChaser ? 'Chaser' : 'Evader'}
        </span>
        <button
          onClick={() => setShowCoords(v => !v)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showCoords
              ? 'bg-neutral-700 text-neutral-200 border-neutral-600'
              : 'bg-neutral-900 text-neutral-600 border-neutral-800 hover:text-neutral-400'
          }`}
        >
          coords
        </button>
      </div>

      {objectiveFlash && (
        <div className="px-4 py-2 bg-amber-900/70 border border-amber-600 rounded-lg text-amber-300 text-sm font-semibold animate-pulse">
          Objective collected! ({gameState.objectivesCollected} / {gameState.settings.objectivesTarget})
        </div>
      )}

      <HexBoard
        myPos={myPos}
        opponentPos={opponentPos}
        prevMyPath={prevMyPath}
        prevOpponentPath={prevOpponentPath}
        committedMyPath={null}
        committedOpponentPath={null}
        isChaser={isChaser}
        elevations={gameState.elevations}
        walls={gameState.walls}
        showCoords={showCoords}
        currentStep={currentStep}
        draft={draft}
        waitingForPartner={effectiveWaiting}
        winner={gameState.winner}
        validTargets={validTargets}
        onHexClick={handleHexClick}
        objectives={gameState.objectives}
        showObjectives={!isChaser || gameState.settings.objectivesVisible}
      />

      {gameState.matchState.matchWinner ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold text-yellow-400">
            {gameState.matchState.matchWinner === playerRole ? '🏆 You won the match!' : '💀 Opponent won the match.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
          >
            Play Again
          </button>
        </div>
      ) : gameState.winner ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">
            {(gameState.winner === 'chaser') === isChaser ? '🎉 You win the round!' : 'Opponent wins the round.'}
          </p>
          {canStartNextRound ? (
            <button
              onClick={startNextRound}
              className="px-6 py-2 bg-green-800 hover:bg-green-700 rounded-lg text-sm text-neutral-300 transition-colors"
            >
              Start Next Round
            </button>
          ) : (
            <p className="text-sm text-neutral-400 animate-pulse">Waiting for Host to start next round…</p>
          )}
        </div>
      ) : (
        <div className="w-full max-w-sm" key={gameState.turn}>
          <PlanningPanel
            isChaser={isChaser}
            turn={gameState.turn}
            maxTurns={maxTurns}
            schema={schema}
            currentStep={currentStep}
            draft={draft}
            lastResolution={gameState.lastResolution}
            waitingForPartner={effectiveWaiting}
            onConfirm={handleConfirm}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  )
}

// ── PvP game view ─────────────────────────────────────────────────────────────

function GameView({
  roomCode,
  playerRole,
  settings,
}: {
  roomCode: string
  playerRole: 1 | 2
  settings: MatchSettings | null
}) {
  const { gameState, status, errorMsg, waitingForPartner, submitPlan, startNextRound } =
    useHexGame(roomCode, playerRole, settings)

  if (status === 'connecting')          return <StatusScreen message="Connecting…" />
  if (status === 'error')               return <StatusScreen message={errorMsg ?? 'Connection error.'} />
  if (status === 'disconnected')        return <StatusScreen message="Your opponent disconnected." />
  if (status === 'reconnecting')        return <ReconnectingScreen />
  if (status === 'waiting_for_level')   return <StatusScreen message="Joining game…" />
  if (status === 'waiting_for_partner') {
    const isChaser = gameState?.settings.chaserPlayer === playerRole
    const opponentRole = isChaser ? 'Evader' : 'Chaser'
    return <WaitingForPartner roomCode={roomCode} opponentRole={opponentRole} transport="live" />
  }
  if (!gameState) return <StatusScreen message="Loading…" />

  return (
    <ActiveGame
      gameState={gameState}
      playerRole={playerRole}
      waitingForPartner={waitingForPartner}
      canStartNextRound={playerRole === 1}
      submitPlan={submitPlan}
      startNextRound={startNextRound}
    />
  )
}

// ── Async PvP game view ───────────────────────────────────────────────────────
//
// Supabase-backed transport. Either player may start the next round, since the host
// may be offline when a round ends.

function AsyncGameView({
  roomCode,
  playerRole,
  settings,
}: {
  roomCode: string
  playerRole: 1 | 2
  settings: MatchSettings | null
}) {
  const { gameState, status, errorMsg, waitingForPartner, submitPlan, startNextRound } =
    useHexGameAsync(roomCode, playerRole, settings)

  if (status === 'connecting')        return <StatusScreen message="Connecting…" />
  if (status === 'error')             return <StatusScreen message={errorMsg ?? 'Connection error.'} />
  if (status === 'waiting_for_partner') {
    const isChaser = gameState?.settings.chaserPlayer === playerRole
    const opponentRole = isChaser ? 'Evader' : 'Chaser'
    return <WaitingForPartner roomCode={roomCode} opponentRole={opponentRole} transport="async" />
  }
  if (!gameState) return <StatusScreen message="Loading…" />

  return (
    <ActiveGame
      gameState={gameState}
      playerRole={playerRole}
      waitingForPartner={waitingForPartner}
      canStartNextRound={true}
      submitPlan={submitPlan}
      startNextRound={startNextRound}
    />
  )
}

// ── AI game view ──────────────────────────────────────────────────────────────

function AIGameView({
  settings,
  aiStrategy,
}: {
  settings: MatchSettings
  aiStrategy: SimulationAgent
}) {
  const { gameState, submitPlan, startNextRound } = useHexGameVsAI(settings, aiStrategy)

  return (
    <ActiveGame
      gameState={gameState}
      playerRole={1}
      waitingForPartner={false}
      canStartNextRound={true}
      submitPlan={submitPlan}
      startNextRound={startNextRound}
    />
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

type GameConfig =
  | { mode: 'pvp'; transport: Transport; code: string; role: 1 | 2; settings: MatchSettings | null }
  | { mode: 'ai';  settings: MatchSettings; aiStrategy: SimulationAgent }

/**
 * The room creator is player 1; a link-opener is player 2. We persist the creator's role
 * keyed by room code so that reopening or refreshing their own (?room=…) URL resumes the
 * host side instead of being mistaken for a joiner.
 */
function roleStorageKey(code: string): string {
  return `hextag-role-${code}`
}

function persistedRole(code: string): 1 | 2 {
  return localStorage.getItem(roleStorageKey(code)) === '1' ? 1 : 2
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const isEditor    = params.get('editor')    === 'true'
  const isSimulator = params.get('simulator') === 'true'

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(() => {
    const code = params.get('room')
    if (!code) return null
    const upper = code.toUpperCase()
    const transport: Transport = params.get('mode') === 'async' ? 'async' : 'live'
    return { mode: 'pvp', transport, code: upper, role: persistedRole(upper), settings: null }
  })

  const handleCreateGame = useCallback((lobby: LobbySettings) => {
    const code = generateRoomCode()
    const url = new URL(window.location.href)
    url.searchParams.set('room', code)
    if (lobby.transport === 'async') url.searchParams.set('mode', 'async')
    history.replaceState(null, '', url.toString())
    localStorage.setItem(roleStorageKey(code), '1')
    setGameConfig({
      mode: 'pvp',
      transport: lobby.transport,
      code,
      role: 1,
      settings: resolveMatchSettings(lobby),
    })
  }, [])

  const handlePlayVsAI = useCallback((lobby: LobbySettings, aiStrategy: SimulationAgent) => {
    setGameConfig({ mode: 'ai', settings: resolveMatchSettings(lobby), aiStrategy })
  }, [])

  if (isEditor)    return <MapEditor />
  if (isSimulator) return <SimulatorView />

  if (!gameConfig) {
    return (
      <Lobby
        onCreateGame={handleCreateGame}
        onPlayVsAI={handlePlayVsAI}
        onOpenSimulator={() => { window.location.href = '?simulator=true' }}
      />
    )
  }

  if (gameConfig.mode === 'ai') {
    return <AIGameView settings={gameConfig.settings} aiStrategy={gameConfig.aiStrategy} />
  }

  if (gameConfig.transport === 'async') {
    return (
      <AsyncGameView
        roomCode={gameConfig.code}
        playerRole={gameConfig.role}
        settings={gameConfig.settings}
      />
    )
  }

  return (
    <GameView
      roomCode={gameConfig.code}
      playerRole={gameConfig.role}
      settings={gameConfig.settings}
    />
  )
}
