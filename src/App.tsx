import { useState, useCallback, useEffect } from 'react'
import { useHexGame } from './hooks/useHexGame'
import { HexBoard } from './components/HexBoard'
import { PlanningPanel } from './components/PlanningPanel'
import type { DraftPlan } from './components/PlanningPanel'
import type { TurnSchema, UIStep } from './types'
import { Lobby } from './components/Lobby'
import { MapEditor } from './components/MapEditor'
import type { HexCoord, TurnPlan, MatchSettings } from './types'
import { resolveMatchSettings } from './lib/matchConfig'
import type { LobbySettings } from './lib/matchConfig'
import { obstacleSet, buildWallSet, reachableDestinations, validNeighbors, calculateEdgeCost } from './lib/hexGameLogic'
import { useMemo } from 'react'

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

function WaitingForPartner({ roomCode, opponentRole }: { roomCode: string; opponentRole: string }) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`
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

function hexKey(h: HexCoord): string { return `${h.q},${h.r}` }

function getCurrentStep(draft: DraftPlan, schema: TurnSchema): UIStep | 'ready' {
  for (const step of schema.requiredSteps) {
    if (step === 'select_movement' && !draft.moveDest) return step
    if (step === 'select_prediction' && !draft.predictDest) return step
  }
  return 'ready'
}

function applyClick(draft: DraftPlan, hex: HexCoord, schema: TurnSchema, cachedMovePaths: Map<string, HexCoord[]>): DraftPlan {
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

// ── Game view ─────────────────────────────────────────────────────────────────

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

  const [draft, setDraft] = useState<DraftPlan>(EMPTY_DRAFT)
  const [showCoords, setShowCoords] = useState(false)

  const handleConfirm = useCallback((plan: TurnPlan) => {
    submitPlan(plan)
  }, [submitPlan])

  const handleReset = useCallback(() => {
    setDraft(EMPTY_DRAFT)
  }, [])

  // Reset draft on turn advance
  useEffect(() => {
    setDraft(EMPTY_DRAFT)
  }, [gameState?.turn])

  // Derived values — computed before early returns so hook order stays stable.
  const isChaser         = gameState?.settings.chaserPlayer === playerRole
  const roleKey          = isChaser ? 'chaser' : 'evader'
  const schema: TurnSchema = gameState?.turnSchema[roleKey] ?? { requiredSteps: [] }
  const currentStep      = getCurrentStep(draft, schema)
  // Players with no steps this phase are handled natively by the engine.
  const effectiveWaiting = waitingForPartner || schema.requiredSteps.length === 0

  // Topology — recomputed only when map structure changes, never on draft updates.
  const topology = useMemo(() => {
    if (!gameState) return null
    return {
      wallKeys: buildWallSet(gameState.walls),
    }
  }, [gameState])

  // Heavy pathfinding — isolated from draft; runs exactly once per turn phase.
  // Now returns a Map to give O(1) access to the shortest paths.
  const cachedMovePaths = useMemo<Map<string, HexCoord[]>>(() => {
    if (!gameState || !topology || effectiveWaiting || gameState.winner) return new Map()
    const myPos = isChaser ? gameState.chaserPos : gameState.evaderPos
    const myBudget = isChaser ? gameState.p1Budget : gameState.p2Budget
    return reachableDestinations(myPos, gameState.elevations, topology.wallKeys, myBudget)
  }, [gameState, topology, effectiveWaiting, isChaser])

  const cachedPredictPaths = useMemo<Map<string, HexCoord[]>>(() => {
    if (!gameState || !topology || effectiveWaiting || gameState.winner) return new Map()
    const opponentPos = isChaser ? gameState.evaderPos : gameState.chaserPos
    const oppBudget = isChaser ? gameState.p2Budget : gameState.p1Budget
    return reachableDestinations(opponentPos, gameState.elevations, topology.wallKeys, oppBudget)
  }, [gameState, topology, effectiveWaiting, isChaser])

  // Target sets for the UI
  const cachedMoveTargets = useMemo(() => new Set(cachedMovePaths.keys()), [cachedMovePaths])
  const cachedPredictTargets = useMemo(() => new Set(cachedPredictPaths.keys()), [cachedPredictPaths])

  const handleHexClick = useCallback((hex: HexCoord) => {
    setDraft(prev => {
      if (!gameState) return prev
      const isChaserLocal = gameState.settings.chaserPlayer === playerRole
      const roleKey = isChaserLocal ? 'chaser' : 'evader'
      const schema = gameState.turnSchema[roleKey]
      return applyClick(prev, hex, schema, cachedMovePaths)
    })
  }, [gameState, playerRole, cachedMovePaths])

  // O(1) router — returns pre-computed sets for move/predict; bonus stays draft-reactive
  // because its origin is the uncommitted moveDest, not the authoritative game position.
  const validTargets = useMemo<Set<string>>(() => {
    if (!gameState || effectiveWaiting || gameState.winner || !topology) return new Set()
    switch (currentStep) {
      case 'select_movement':   return cachedMoveTargets
      case 'select_prediction': return cachedPredictTargets
      case 'ready': return new Set()
    }
  }, [gameState, effectiveWaiting, currentStep, cachedMoveTargets, cachedPredictTargets, topology])

  if (status === 'connecting')          return <StatusScreen message="Connecting…" />
  if (status === 'error')               return <StatusScreen message={errorMsg ?? 'Connection error.'} />
  if (status === 'disconnected')        return <StatusScreen message="Your opponent disconnected." />
  if (status === 'reconnecting')        return <ReconnectingScreen />
  if (status === 'waiting_for_partner') {
    const opponentRole = isChaser ? 'Evader' : 'Chaser'
    return <WaitingForPartner roomCode={roomCode} opponentRole={opponentRole} />
  }
  if (status === 'waiting_for_level')   return <StatusScreen message="Joining game…" />
  if (!gameState)                       return <StatusScreen message="Loading…" />

  const maxTurns     = gameState.settings.maxTurns
  const myPos        = isChaser ? gameState.chaserPos    : gameState.evaderPos
  const opponentPos  = isChaser ? gameState.evaderPos    : gameState.chaserPos
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
          {playerRole === 1 ? (
            <button
              onClick={startNextRound}
              className="px-6 py-2 bg-green-800 hover:bg-green-700 rounded-lg text-sm text-neutral-300 transition-colors"
            >
              Start Next Round
            </button>
          ) : (
            <p className="text-sm text-neutral-400 animate-pulse">Waiting for Host to start next round...</p>
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

// ── Root ──────────────────────────────────────────────────────────────────────

type RoomInfo = { code: string; role: 1 | 2; settings: MatchSettings | null }

export default function App() {
  const isEditor = new URLSearchParams(window.location.search).get('editor') === 'true'

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(() => {
    const code = new URLSearchParams(window.location.search).get('room')
    return code ? { code: code.toUpperCase(), role: 2, settings: null } : null
  })

  const handleCreateGame = useCallback((lobby: LobbySettings) => {
    const code = generateRoomCode()
    const url = new URL(window.location.href)
    url.searchParams.set('room', code)
    history.replaceState(null, '', url.toString())
    setRoomInfo({ code, role: 1, settings: resolveMatchSettings(lobby) })
  }, [])

  if (isEditor) return <MapEditor />
  if (!roomInfo) return <Lobby onCreateGame={handleCreateGame} />
  return <GameView roomCode={roomInfo.code} playerRole={roomInfo.role} settings={roomInfo.settings} />
}
