import { useState, useCallback, useEffect } from 'react'
import { useHexGame } from './hooks/useHexGame'
import { HexBoard } from './components/HexBoard'
import { PlanningPanel } from './components/PlanningPanel'
import type { DraftPlan } from './components/PlanningPanel'
import type { TurnSchema, UIStep } from './types'
import { Lobby } from './components/Lobby'
import type { HexCoord, TurnPlan, MatchSettings } from './types'
import { resolveMatchSettings } from './lib/matchConfig'
import type { LobbySettings } from './lib/matchConfig'
import { obstacleSet, buildWallSet, reachableDestinations, validNeighbors } from './lib/hexGameLogic'
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
  predictDest: null,
  bonusMove: null,
}

function hexKey(h: HexCoord): string { return `${h.q},${h.r}` }

function getValidTargets(
  step: UIStep | 'ready',
  draft: DraftPlan,
  myPos: HexCoord,
  opponentPos: HexCoord,
  obstacles: HexCoord[],
  walls: Set<string>,
): Set<string> {
  const blocked = obstacleSet(obstacles)
  switch (step) {
    case 'select_movement':
      return new Set(reachableDestinations(myPos, blocked, walls).map(hexKey))
    case 'select_prediction':
      return new Set(reachableDestinations(opponentPos, blocked, walls).map(hexKey))
    case 'select_bonus':
      return new Set(validNeighbors(draft.moveDest ?? myPos, blocked, walls).map(hexKey))
    case 'ready':
      return new Set()
  }
}

function getCurrentStep(draft: DraftPlan, schema: TurnSchema): UIStep | 'ready' {
  for (const step of schema.requiredSteps) {
    if (step === 'select_movement' && !draft.moveDest) return step
    if (step === 'select_prediction' && !draft.predictDest) return step
    if (step === 'select_bonus' && !draft.bonusMove) return step
  }
  return 'ready'
}

function applyClick(draft: DraftPlan, hex: HexCoord, schema: TurnSchema): DraftPlan {
  const step = getCurrentStep(draft, schema)
  switch (step) {
    case 'select_movement':   return { ...draft, moveDest: hex }
    case 'select_prediction': return { ...draft, predictDest: hex }
    case 'select_bonus':      return { ...draft, bonusMove: hex }
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
  const { gameState, status, errorMsg, waitingForPartner, submitPlan } =
    useHexGame(roomCode, playerRole, settings)

  const [draft, setDraft] = useState<DraftPlan>(EMPTY_DRAFT)
  const [showCoords, setShowCoords] = useState(false)

  const handleHexClick = useCallback((hex: HexCoord) => {
    setDraft(prev => {
      if (!gameState) return prev
      const isChaser = gameState.settings.chaserPlayer === playerRole
      const roleKey = isChaser ? 'chaser' : 'evader'
      const schema = gameState.turnSchema[roleKey]
      return applyClick(prev, hex, schema)
    })
  }, [gameState, playerRole])

  const handleConfirm = useCallback((plan: TurnPlan) => {
    submitPlan(plan)
  }, [submitPlan])

  const handleReset = useCallback(() => {
    setDraft(EMPTY_DRAFT)
  }, [])

  // Reset draft on turn advance and on phase change (critical for post-reveal bonus_phase)
  useEffect(() => {
    setDraft(EMPTY_DRAFT)
  }, [gameState?.turn, gameState?.phase])

  // Derived values — computed before early returns so hook order stays stable.
  const isChaser         = gameState?.settings.chaserPlayer === playerRole
  const roleKey          = isChaser ? 'chaser' : 'evader'
  const schema: TurnSchema = gameState?.turnSchema[roleKey] ?? { requiredSteps: [] }
  const currentStep      = getCurrentStep(draft, schema)
  // Players with no steps this phase are handled natively by the engine.
  const effectiveWaiting = waitingForPartner || schema.requiredSteps.length === 0

  const validTargets = useMemo(() => {
    if (!gameState || effectiveWaiting || gameState.winner) return new Set<string>()
    const myPos       = isChaser ? gameState.chaserPos : gameState.evaderPos
    const opponentPos = isChaser ? gameState.evaderPos : gameState.chaserPos
    const wallKeys    = buildWallSet(gameState.walls)
    return getValidTargets(currentStep, draft, myPos, opponentPos, gameState.obstacles, wallKeys)
  }, [gameState, effectiveWaiting, isChaser, currentStep, draft])

  if (status === 'connecting')          return <StatusScreen message="Connecting…" />
  if (status === 'error')               return <StatusScreen message={errorMsg ?? 'Connection error.'} />
  if (status === 'disconnected')        return <StatusScreen message="Your opponent disconnected." />
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

  // Post-reveal bonus_phase: show committed movement paths for both players.
  const committedChaserPath = gameState.transientContext.committedChaserPath ?? null
  const committedEvaderPath = gameState.transientContext.committedEvaderPath ?? null
  const committedMyPath       = isChaser ? committedChaserPath : committedEvaderPath
  const committedOpponentPath = isChaser ? committedEvaderPath : committedChaserPath

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
        committedMyPath={committedMyPath}
        committedOpponentPath={committedOpponentPath}
        isChaser={isChaser}
        obstacles={gameState.obstacles}
        walls={gameState.walls}
        showCoords={showCoords}
        currentStep={currentStep}
        draft={draft}
        waitingForPartner={effectiveWaiting}
        winner={gameState.winner}
        validTargets={validTargets}
        onHexClick={handleHexClick}
      />

      {gameState.winner ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">
            {(gameState.winner === 'chaser') === isChaser ? '🎉 You win!' : 'Opponent wins.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 transition-colors"
          >
            Play Again
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm" key={`${gameState.turn}-${gameState.phase}`}>
          <PlanningPanel
            isChaser={isChaser}
            turn={gameState.turn}
            maxTurns={maxTurns}
            phase={gameState.phase}
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

  if (!roomInfo) return <Lobby onCreateGame={handleCreateGame} />
  return <GameView roomCode={roomInfo.code} playerRole={roomInfo.role} settings={roomInfo.settings} />
}
