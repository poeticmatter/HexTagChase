import { useState, useCallback, useEffect, useMemo } from 'react'
import { useHexGame } from './hooks/useHexGame'
import { useHexGameAsync } from './hooks/useHexGameAsync'
import { HexBoard } from './components/HexBoard'
import { PlanningPanel } from './components/PlanningPanel'
import type { TurnSchema, UIStep, UserRole, DraftPlan, SpectatorDrafts, HexCoord, TurnPlan, MatchSettings, GameState } from './types'
import { Lobby } from './components/Lobby'
import { MapEditor } from './components/MapEditor'
import { resolveMatchSettings } from './lib/matchConfig'
import type { LobbySettings, Transport } from './lib/matchConfig'
import { buildWallSet, reachableDestinations, effectiveTurnBudget } from './lib/hexGameLogic'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Utility screens ───────────────────────────────────────────────────────────

function StatusScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-4 font-sans">
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
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-3 font-sans">
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
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white gap-6 font-sans">
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
      {transport === 'live' && (
        <p className="text-purple-400/90 text-xs">
          Additional players joining via this link will watch as Spectators.
        </p>
      )}
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

interface ActiveGameProps {
  gameState: GameState
  playerRole: UserRole
  spectatorCount?: number
  spectatorDrafts?: SpectatorDrafts
  sendDraftUpdate?: (draft: DraftPlan) => void
  waitingForPartner: boolean
  canStartNextRound: boolean
  submitPlan: (plan: TurnPlan) => void
  startNextRound: () => void
}

function ActiveGame({
  gameState,
  playerRole,
  spectatorCount,
  spectatorDrafts,
  sendDraftUpdate,
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

  // Stream local draft updates in real time to spectators
  useEffect(() => {
    if (playerRole !== 'spectator' && sendDraftUpdate) {
      sendDraftUpdate(draft)
    }
  }, [draft, playerRole, sendDraftUpdate])

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

  const isSpectator      = playerRole === 'spectator'
  const isChaser         = isSpectator ? (gameState.settings.chaserPlayer === 1) : (gameState.settings.chaserPlayer === playerRole)
  const roleKey          = isChaser ? 'chaser' : 'evader'
  const schema: TurnSchema = gameState.turnSchema[roleKey]
  const currentStep      = isSpectator ? 'ready' : getCurrentStep(draft, schema)
  const effectiveWaiting = isSpectator || waitingForPartner || schema.requiredSteps.length === 0

  const topology = useMemo(() => ({
    wallKeys: buildWallSet(gameState.walls),
  }), [gameState.walls, gameState.obstacles])

  const cachedMovePaths = useMemo<Map<string, HexCoord[]>>(() => {
    if (effectiveWaiting || gameState.winner) return new Map()
    const myPos    = isChaser ? gameState.chaserPos : gameState.evaderPos
    const myBudget = playerRole === 1 ? gameState.p1Budget : gameState.p2Budget
    const budget   = effectiveTurnBudget(gameState.settings, myBudget, gameState.turn)
    return reachableDestinations(myPos, gameState.elevations, topology.wallKeys, budget)
  }, [gameState, topology, effectiveWaiting, isChaser, playerRole])

  const cachedPredictPaths = useMemo<Map<string, HexCoord[]>>(() => {
    if (effectiveWaiting || gameState.winner) return new Map()
    const opponentPos    = isChaser ? gameState.evaderPos  : gameState.chaserPos
    const opponentBudget = playerRole === 1 ? gameState.p2Budget : gameState.p1Budget
    const budget         = effectiveTurnBudget(gameState.settings, opponentBudget, gameState.turn)
    return reachableDestinations(opponentPos, gameState.elevations, topology.wallKeys, budget)
  }, [gameState, topology, effectiveWaiting, isChaser, playerRole])

  const cachedMoveTargets    = useMemo(() => new Set(cachedMovePaths.keys()),    [cachedMovePaths])
  const cachedPredictTargets = useMemo(() => new Set(cachedPredictPaths.keys()), [cachedPredictPaths])

  const handleHexClick = useCallback((hex: HexCoord) => {
    if (isSpectator) return
    setDraft(prev => {
      const isChaserLocal = gameState.settings.chaserPlayer === playerRole
      const schemaLocal   = gameState.turnSchema[isChaserLocal ? 'chaser' : 'evader']
      return applyClick(prev, hex, schemaLocal, cachedMovePaths)
    })
  }, [gameState, playerRole, cachedMovePaths, isSpectator])

  const validTargets = useMemo<Set<string>>(() => {
    if (isSpectator || effectiveWaiting || gameState.winner) return new Set()
    switch (currentStep) {
      case 'select_movement':   return cachedMoveTargets
      case 'select_prediction': return cachedPredictTargets
      case 'ready':             return new Set()
    }
  }, [isSpectator, effectiveWaiting, currentStep, cachedMoveTargets, cachedPredictTargets, gameState.winner])

  const myPos            = isChaser ? gameState.chaserPos    : gameState.evaderPos
  const opponentPos      = isChaser ? gameState.evaderPos    : gameState.chaserPos
  const prevMyPath       = isChaser ? gameState.prevChaserPath : gameState.prevEvaderPath
  const prevOpponentPath = isChaser ? gameState.prevEvaderPath : gameState.prevChaserPath

  const chaserBudget = gameState.settings.chaserPlayer === 1 ? gameState.p1Budget : gameState.p2Budget
  const evaderBudget = gameState.settings.chaserPlayer === 1 ? gameState.p2Budget : gameState.p1Budget

  return (
    <div className="w-full min-h-screen bg-neutral-900 flex flex-col items-center justify-start text-white gap-3 p-4 font-sans">
      {/* Title & Spectator Badge */}
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-3xl font-black tracking-widest bg-gradient-to-r from-red-500 via-amber-400 to-blue-500 bg-clip-text text-transparent drop-shadow-lg uppercase text-center mt-2">
          HEX TAG CHASE
        </h1>
        {isSpectator && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-900/80 border border-purple-500/80 rounded-full text-purple-200 text-xs font-bold shadow-md uppercase tracking-wider">
            <svg className="w-3.5 h-3.5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Spectator Mode (Live Info)
          </div>
        )}
      </div>

      {/* Cohesive Scoreboard HUD - Left Chaser (Red) | Right Evader (Blue) */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md px-2">
        {/* Left: Chaser Pool */}
        <div className={`flex flex-col items-center justify-center py-2 px-4 rounded-xl border transition-all ${
          isChaser && !isSpectator
            ? 'bg-red-950/60 border-red-500/80 shadow-lg shadow-red-950/50 ring-1 ring-red-500/40'
            : 'bg-neutral-800/70 border-red-900/30 opacity-80'
        }`}>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
            Chaser Pool
            {!isSpectator && isChaser && <span className="text-[9px] font-bold text-red-200 bg-red-800 px-1.5 py-0.5 rounded-full">(YOU)</span>}
          </span>
          <span className="text-3xl font-mono font-black text-red-400 tracking-tight">
            {chaserBudget}
          </span>
        </div>

        {/* Right: Evader Pool */}
        <div className={`flex flex-col items-center justify-center py-2 px-4 rounded-xl border transition-all ${
          !isChaser && !isSpectator
            ? 'bg-blue-950/60 border-blue-500/80 shadow-lg shadow-blue-950/50 ring-1 ring-blue-500/40'
            : 'bg-neutral-800/70 border-blue-900/30 opacity-80'
        }`}>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
            Evader Pool
            {!isSpectator && !isChaser && <span className="text-[9px] font-bold text-blue-200 bg-blue-800 px-1.5 py-0.5 rounded-full">(YOU)</span>}
          </span>
          <span className="text-3xl font-mono font-black text-blue-400 tracking-tight">
            {evaderBudget}
          </span>
        </div>
      </div>

      {spectatorCount !== undefined && spectatorCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-purple-950/60 border border-purple-800/50 rounded-full text-purple-300">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span>{spectatorCount} {spectatorCount === 1 ? 'Spectator' : 'Spectators'} Watching</span>
        </div>
      )}

      {objectiveFlash && (
        <div className="px-4 py-1.5 bg-amber-900/80 border border-amber-600/80 rounded-lg text-amber-300 text-xs font-semibold animate-pulse shadow-md">
          Objective collected! (+2 movement pool)
        </div>
      )}

      {/* Board Container */}
      <div className="relative rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl">
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
          chaserDraft={spectatorDrafts?.chaserDraft}
          evaderDraft={spectatorDrafts?.evaderDraft}
          isSpectator={isSpectator}
          waitingForPartner={effectiveWaiting}
          winner={gameState.winner}
          validTargets={validTargets}
          onHexClick={handleHexClick}
          objectives={gameState.objectives}
          showObjectives={true}
        />
      </div>

      {gameState.matchState.matchWinner ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold text-yellow-400">
            {!isSpectator && gameState.matchState.matchWinner === playerRole
              ? '🏆 You won the match!'
              : isSpectator
              ? `🏆 Match finished! Player ${gameState.matchState.matchWinner} won the match!`
              : '💀 Opponent won the match.'}
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
            {isSpectator
              ? `Round over! ${gameState.winner === 'chaser' ? 'Chaser' : 'Evader'} won.`
              : (gameState.winner === 'chaser') === isChaser
              ? '🎉 You win the round!'
              : 'Opponent wins the round.'}
          </p>
          {canStartNextRound ? (
            <button
              onClick={startNextRound}
              className="px-6 py-2 bg-green-800 hover:bg-green-700 rounded-lg text-sm text-neutral-300 transition-colors"
            >
              Start Next Round
            </button>
          ) : (
            <p className="text-sm text-neutral-400 animate-pulse">
              Waiting for Host to start next round…
            </p>
          )}
        </div>
      ) : isSpectator ? (
        <div className="w-full max-w-sm flex flex-col items-center gap-3">
          <div className="w-full bg-neutral-800/90 border border-purple-900/50 rounded-xl p-4 flex flex-col items-center text-center gap-3 shadow-lg">
            <div className="text-xs font-extrabold uppercase tracking-wider text-purple-400">
              Spectating Round {gameState.matchState.roundNumber} — Turn {gameState.turn}
            </div>

            <div className="grid grid-cols-2 gap-2 w-full text-xs">
              <div className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${
                spectatorDrafts?.chaserDraft?.moveDest && spectatorDrafts?.chaserDraft?.predictDest
                  ? 'bg-red-950/80 border-red-500/80 text-red-200 shadow-md shadow-red-950/40'
                  : spectatorDrafts?.chaserDraft?.moveDest
                  ? 'bg-red-950/40 border-red-700/50 text-red-300'
                  : 'bg-neutral-900/60 border-neutral-700 text-neutral-400'
              }`}>
                <div className="font-extrabold text-red-400 uppercase tracking-wide">Chaser Plan</div>
                <div className="flex items-center gap-1 font-medium">
                  <span>{spectatorDrafts?.chaserDraft?.moveDest ? '✓ Move Selected' : 'Selecting Move...'}</span>
                </div>
                <div className="flex items-center gap-1 font-medium">
                  <span>{spectatorDrafts?.chaserDraft?.predictDest ? '🎯 Predict Selected' : 'Selecting Predict...'}</span>
                </div>
              </div>

              <div className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${
                spectatorDrafts?.evaderDraft?.moveDest && spectatorDrafts?.evaderDraft?.predictDest
                  ? 'bg-blue-950/80 border-blue-500/80 text-blue-200 shadow-md shadow-blue-950/40'
                  : spectatorDrafts?.evaderDraft?.moveDest
                  ? 'bg-blue-950/40 border-blue-700/50 text-blue-300'
                  : 'bg-neutral-900/60 border-neutral-700 text-neutral-400'
              }`}>
                <div className="font-extrabold text-blue-400 uppercase tracking-wide">Evader Plan</div>
                <div className="flex items-center gap-1 font-medium">
                  <span>{spectatorDrafts?.evaderDraft?.moveDest ? '✓ Move Selected' : 'Selecting Move...'}</span>
                </div>
                <div className="flex items-center gap-1 font-medium">
                  <span>{spectatorDrafts?.evaderDraft?.predictDest ? '🎯 Predict Selected' : 'Selecting Predict...'}</span>
                </div>
              </div>
            </div>

            {gameState.lastResolution && (
              <div className="text-xs text-neutral-400 mt-1 bg-neutral-900/60 px-3 py-1.5 rounded-lg border border-neutral-700/50">
                Turn {gameState.turn - 1} Predictions: Chaser {gameState.lastResolution.chaserPredHit ? '🎯 Hit' : '❌ Miss'} | Evader {gameState.lastResolution.evaderPredHit ? '🎯 Hit' : '❌ Miss'}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowCoords(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ${
              showCoords
                ? 'bg-neutral-700 text-neutral-200 border-neutral-500 shadow-sm'
                : 'bg-neutral-800/80 text-neutral-400 border-neutral-700 hover:text-neutral-200 hover:border-neutral-600'
            }`}
            title="Toggle grid coordinates"
          >
            <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16M6 4v16M12 4v16M18 4v16" />
            </svg>
            <span className="font-medium">Coords</span>
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm flex flex-col items-center gap-3" key={gameState.turn}>
          <PlanningPanel
            isChaser={isChaser}
            turn={gameState.turn}
            schema={schema}
            currentStep={currentStep}
            draft={draft}
            lastResolution={gameState.lastResolution}
            waitingForPartner={effectiveWaiting}
            onConfirm={handleConfirm}
            onReset={handleReset}
          />

          {/* Small Coords button with grid icon at bottom */}
          <button
            onClick={() => setShowCoords(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ${
              showCoords
                ? 'bg-neutral-700 text-neutral-200 border-neutral-500 shadow-sm'
                : 'bg-neutral-800/80 text-neutral-400 border-neutral-700 hover:text-neutral-200 hover:border-neutral-600'
            }`}
            title="Toggle grid coordinates"
          >
            <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16M6 4v16M12 4v16M18 4v16" />
            </svg>
            <span className="font-medium">Coords</span>
          </button>
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
  playerRole: UserRole
  settings: MatchSettings | null
}) {
  const {
    gameState,
    status,
    errorMsg,
    waitingForPartner,
    submitPlan,
    startNextRound,
    assignedRole,
    spectatorCount,
    spectatorDrafts,
    sendDraftUpdate,
    availablePlayerSlots,
    requestRole,
  } = useHexGame(roomCode, playerRole, settings)

  const [preferredRole, setPreferredRole] = useState<'player' | 'spectator' | null>(null)

  if (status === 'connecting')          return <StatusScreen message="Connecting…" />
  if (status === 'error')               return <StatusScreen message={errorMsg ?? 'Connection error.'} />
  if (status === 'disconnected')        return <StatusScreen message="Your opponent disconnected." />
  if (status === 'reconnecting')        return <ReconnectingScreen />
  if (status === 'waiting_for_level')   return <StatusScreen message="Joining game…" />
  if (status === 'waiting_for_partner') {
    const isChaser = gameState?.settings.chaserPlayer === 1
    const opponentRole = playerRole === 'spectator' ? 'Players' : (isChaser ? 'Evader' : 'Chaser')
    return <WaitingForPartner roomCode={roomCode} opponentRole={opponentRole} transport="live" />
  }

  // Join Role Prompt Modal if joining an open room and slot is available
  if (settings === null && availablePlayerSlots && preferredRole === null) {
    return (
      <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white p-6 font-sans">
        <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-6 shadow-2xl text-center">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">Join Room {roomCode}</h2>
            <p className="text-xs text-neutral-400">A player slot is available in this room.</p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => {
                setPreferredRole('player')
                requestRole('player')
              }}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              🎮 Join as Player
            </button>
            <button
              onClick={() => {
                setPreferredRole('spectator')
                requestRole('spectator')
              }}
              className="w-full py-3 px-4 bg-purple-900/80 hover:bg-purple-800 border border-purple-600/60 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-md text-purple-200"
            >
              👁️ Watch as Spectator
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'spectating' || assignedRole === 'spectator') {
    if (!gameState) return <StatusScreen message="Joining live match as spectator…" />
    return (
      <ActiveGame
        gameState={gameState}
        playerRole="spectator"
        spectatorCount={spectatorCount}
        spectatorDrafts={spectatorDrafts}
        waitingForPartner={false}
        canStartNextRound={settings !== null}
        submitPlan={() => {}}
        startNextRound={startNextRound}
      />
    )
  }
  if (!gameState) return <StatusScreen message="Loading…" />

  return (
    <ActiveGame
      gameState={gameState}
      playerRole={assignedRole}
      spectatorCount={spectatorCount}
      spectatorDrafts={spectatorDrafts}
      sendDraftUpdate={sendDraftUpdate}
      waitingForPartner={waitingForPartner}
      canStartNextRound={settings !== null}
      submitPlan={submitPlan}
      startNextRound={startNextRound}
    />
  )
}

// ── Async PvP game view ───────────────────────────────────────────────────────

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

// ── Root ──────────────────────────────────────────────────────────────────────

type GameConfig =
  | { mode: 'pvp'; transport: Transport; code: string; role: UserRole; settings: MatchSettings | null }

function roleStorageKey(code: string): string {
  return `hextag-role-${code}`
}

function persistedRole(code: string): UserRole {
  const val = localStorage.getItem(roleStorageKey(code))
  if (val === '1') return 1
  if (val === 'spectator') return 'spectator'
  return 2
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const isEditor = params.get('editor') === 'true'

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
    const initialRole: UserRole = lobby.hostRole === 'Spectator' ? 'spectator' : 1
    localStorage.setItem(roleStorageKey(code), initialRole === 1 ? '1' : 'spectator')
    setGameConfig({
      mode: 'pvp',
      transport: lobby.transport,
      code,
      role: initialRole,
      settings: resolveMatchSettings(lobby),
    })
  }, [])

  if (isEditor) return <MapEditor />

  if (!gameConfig) {
    return (
      <Lobby
        onCreateGame={handleCreateGame}
      />
    )
  }

  if (gameConfig.transport === 'async') {
    const asyncRole: 1 | 2 = gameConfig.role === 1 ? 1 : 2
    return (
      <AsyncGameView
        roomCode={gameConfig.code}
        playerRole={asyncRole}
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
