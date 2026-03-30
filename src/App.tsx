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
  declaration: null,
  moveDest1: null,
  moveDest2: null,
  predictDest: null,
  bonusMove: null,
  reactionExecute: null,
  idleConfirmed: null,
}

function getCurrentStep(draft: DraftPlan, schema: TurnSchema): UIStep | 'ready' {
  for (const step of schema.requiredSteps) {
    if (step === 'select_declaration' && !draft.declaration) return step
    if (step === 'select_movement_1' && !draft.moveDest1) return step
    if (step === 'select_movement_2' && !draft.moveDest2) return step
    if (step === 'select_prediction' && !draft.predictDest) return step
    if (step === 'select_bonus' && !draft.bonusMove) return step
    if (step === 'select_reaction' && draft.reactionExecute === null) return step
    if (step === 'idle_confirmation' && !draft.idleConfirmed) return step
  }
  return 'ready'
}

function applyClick(draft: DraftPlan, hex: HexCoord, schema: TurnSchema): DraftPlan {
  const step = getCurrentStep(draft, schema)
  switch (step) {
    case 'select_declaration': return { ...draft, declaration: hex }
    case 'select_movement_1':  return { ...draft, moveDest1: hex }
    case 'select_movement_2':  return { ...draft, moveDest2: hex }
    case 'select_prediction':  return { ...draft, predictDest: hex }
    case 'select_bonus':       return { ...draft, bonusMove: hex }
    case 'select_reaction':    return draft // Handle via buttons, not hex clicks
    case 'idle_confirmation':  return draft // Handle via buttons
    case 'ready':              return draft
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

  // Reset draft whenever the turn advances (round resolved)
  useEffect(() => {
    setDraft(EMPTY_DRAFT)
  }, [gameState?.turn])

  if (status === 'connecting')          return <StatusScreen message="Connecting…" />
  if (status === 'error')               return <StatusScreen message={errorMsg ?? 'Connection error.'} />
  if (status === 'disconnected')        return <StatusScreen message="Your opponent disconnected." />
  if (status === 'waiting_for_partner') {
    const opponentRole = gameState?.settings.chaserPlayer === playerRole ? 'Evader' : 'Chaser'
    return <WaitingForPartner roomCode={roomCode} opponentRole={opponentRole} />
  }
  if (status === 'waiting_for_level')   return <StatusScreen message="Joining game…" />
  if (!gameState)                       return <StatusScreen message="Loading…" />

  const isChaser     = gameState.settings.chaserPlayer === playerRole
  const maxTurns     = gameState.settings.maxTurns
  const myPos        = isChaser ? gameState.chaserPos    : gameState.evaderPos
  const opponentPos  = isChaser ? gameState.evaderPos    : gameState.chaserPos
  const prevMyPath       = isChaser ? gameState.prevChaserPath : gameState.prevEvaderPath
  const prevOpponentPath = isChaser ? gameState.prevEvaderPath : gameState.prevChaserPath
  const roleKey          = isChaser ? 'chaser' : 'evader'
  const schema           = gameState.turnSchema[roleKey]
  const currentStep      = getCurrentStep(draft, schema)

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
        isChaser={isChaser}
        obstacles={gameState.obstacles}
        walls={gameState.walls}
        showCoords={showCoords}
        currentStep={currentStep}
        draft={draft}
        waitingForPartner={waitingForPartner}
        winner={gameState.winner}
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
            waitingForPartner={waitingForPartner}
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
