import { useState, useCallback, useEffect } from 'react'
import { useHexGame } from './hooks/useHexGame'
import { HexBoard } from './components/HexBoard'
import { PlanningPanel } from './components/PlanningPanel'
import type { DraftPlan, PlanningPhase } from './components/PlanningPanel'
import { Lobby } from './components/Lobby'
import type { HexCoord, TurnPlan } from './types'
import { MAX_TURNS } from './lib/hexGameLogic'

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

function WaitingForPartner({ roomCode }: { roomCode: string }) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-6">
      <h2 className="text-2xl font-semibold">Waiting for Evader…</h2>
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
  moveStep1: null,
  moveStep2: null,
  predictStep1: null,
  predictStep2: null,
}

function nextPhase(draft: DraftPlan): PlanningPhase {
  if (!draft.moveStep1)    return 'move_step1'
  if (!draft.moveStep2)    return 'move_step2'
  if (!draft.predictStep1) return 'predict_step1'
  if (!draft.predictStep2) return 'predict_step2'
  return 'ready'
}

function applyClick(draft: DraftPlan, hex: HexCoord): DraftPlan {
  const phase = nextPhase(draft)
  switch (phase) {
    case 'move_step1':    return { ...draft, moveStep1: hex }
    case 'move_step2':    return { ...draft, moveStep2: hex }
    case 'predict_step1': return { ...draft, predictStep1: hex }
    case 'predict_step2': return { ...draft, predictStep2: hex }
    case 'ready':         return draft
  }
}

// ── Game view ─────────────────────────────────────────────────────────────────

function GameView({ roomCode, playerRole }: { roomCode: string; playerRole: 1 | 2 }) {
  const { gameState, status, errorMsg, waitingForPartner, submitPlan } =
    useHexGame(roomCode, playerRole)

  const [draft, setDraft] = useState<DraftPlan>(EMPTY_DRAFT)

  const isChaser = playerRole === 1

  const handleHexClick = useCallback((hex: HexCoord) => {
    setDraft(prev => applyClick(prev, hex))
  }, [])

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
  if (status === 'waiting_for_partner') return <WaitingForPartner roomCode={roomCode} />
  if (status === 'waiting_for_level')   return <StatusScreen message="Joining game…" />
  if (!gameState)                       return <StatusScreen message="Loading…" />

  const myPos           = isChaser ? gameState.chaserPos    : gameState.evaderPos
  const opponentPos     = isChaser ? gameState.evaderPos    : gameState.chaserPos
  const prevMyPath       = isChaser ? gameState.prevChaserPath : gameState.prevEvaderPath
  const prevOpponentPath = isChaser ? gameState.prevEvaderPath : gameState.prevChaserPath
  const planningPhase   = nextPhase(draft)

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-4 p-4 font-sans">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <h1 className="text-2xl font-bold tracking-tight">Hex Tag</h1>
        <span className="text-neutral-500 text-sm">
          Turn {Math.min(gameState.turn, MAX_TURNS)} / {MAX_TURNS}
        </span>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
          isChaser
            ? 'bg-red-900/50 text-red-400 border-red-800'
            : 'bg-blue-900/50 text-blue-400 border-blue-800'
        }`}>
          {isChaser ? 'Chaser' : 'Evader'}
        </span>
      </div>

      <HexBoard
        myPos={myPos}
        opponentPos={opponentPos}
        prevMyPath={prevMyPath}
        prevOpponentPath={prevOpponentPath}
        isChaser={isChaser}
        obstacles={gameState.obstacles}
        planningPhase={planningPhase}
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
        <div className="w-full max-w-sm" key={gameState.turn}>
          <PlanningPanel
            isChaser={isChaser}
            turn={gameState.turn}
            draft={draft}
            planningPhase={planningPhase}
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

export default function App() {
  const [roomInfo, setRoomInfo] = useState<{ code: string; role: 1 | 2 } | null>(() => {
    const code = new URLSearchParams(window.location.search).get('room')
    return code ? { code: code.toUpperCase(), role: 2 } : null
  })

  const handleCreateGame = useCallback(() => {
    const code = generateRoomCode()
    const url = new URL(window.location.href)
    url.searchParams.set('room', code)
    history.replaceState(null, '', url.toString())
    setRoomInfo({ code, role: 1 })
  }, [])

  if (!roomInfo) return <Lobby onCreateGame={handleCreateGame} />
  return <GameView roomCode={roomInfo.code} playerRole={roomInfo.role} />
}
