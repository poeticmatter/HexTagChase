import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { DataConnection } from 'peerjs'
import type { GameState, TurnPlan, ConnectionStatus, MatchSettings } from '../types'
import { processPhase, buildPlanningSchema } from '../lib/hexGameLogic'
import { mapRegistry } from '../lib/mapRegistry'

type PeerMessage =
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'SUBMIT_PLAN'; plan: TurnPlan }

function buildInitialState(settings: MatchSettings): GameState {
  const mapDef = mapRegistry.getMapById(settings.mapId)
  if (!mapDef) {
    throw new Error(`Map with id ${settings.mapId} not found.`)
  }

  return {
    settings,
    chaserPos: mapDef.chaserStart,
    evaderPos: mapDef.evaderStart,
    prevChaserPath: null,
    prevEvaderPath: null,
    phase: 'planning',
    turn: 1,
    winner: null,
    obstacles: mapDef.obstacles,
    walls: mapDef.walls,
    transientContext: {},
    turnSchema: buildPlanningSchema(settings),
    p1TurnData: {},
    p2TurnData: {},
    lastResolution: null,
  }
}

export function useHexGame(roomCode: string, playerRole: 1 | 2, settings: MatchSettings | null) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [waitingForPartner, setWaitingForPartner] = useState(false)

  const live = useRef({
    state: null as GameState | null,
    conn: null as DataConnection | null,
    hostPendingPlan: null as TurnPlan | null,
    clientPendingPlan: null as TurnPlan | null,
  })

  const syncState = useCallback((next: GameState) => {
    live.current.state = next
    setGameState(next)
  }, [])

  const checkExecutionTrigger = useCallback(() => {
    const current = live.current.state
    if (!current) return

    // Route plans into chaser (p1) / evader (p2) slots based on who is actually the chaser.
    // The host is always playerRole 1, but may have chosen to play as evader.
    const hostIsChaser = current.settings.chaserPlayer === 1
    const hostSchema = hostIsChaser ? current.turnSchema.chaser : current.turnSchema.evader
    const clientSchema = hostIsChaser ? current.turnSchema.evader : current.turnSchema.chaser

    // A player with an empty schema for this phase has nothing to submit.
    // In bonus_phase, exactly one player has an empty schema — the non-entitled player.
    // This prevents the orchestrator from deadlocking waiting for them.
    const hostReady = hostSchema.requiredSteps.length === 0 || live.current.hostPendingPlan !== null
    const clientReady = clientSchema.requiredSteps.length === 0 || live.current.clientPendingPlan !== null

    if (hostReady && clientReady) {
      const hostPlan = hostSchema.requiredSteps.length === 0 ? null : live.current.hostPendingPlan
      const clientPlan = clientSchema.requiredSteps.length === 0 ? null : live.current.clientPendingPlan

      const p1Plan = hostIsChaser ? hostPlan : clientPlan
      const p2Plan = hostIsChaser ? clientPlan : hostPlan

      const nextState = processPhase(current, p1Plan, p2Plan)

      live.current.hostPendingPlan = null
      live.current.clientPendingPlan = null
      setWaitingForPartner(false)

      syncState(nextState)
      live.current.conn?.send({ type: 'GAME_STATE', state: nextState } as PeerMessage)
    }
  }, [syncState])

  useEffect(() => {
    const peer = playerRole === 1
      ? new Peer(`hex-tag-${roomCode}`)
      : new Peer()

    const onDisconnect = () => setStatus('disconnected')
    const onError = (msg: string) => { setErrorMsg(msg); setStatus('error') }

    if (playerRole === 1) {
      if (!settings) return
      syncState(buildInitialState(settings))
      peer.on('open', () => setStatus('waiting_for_partner'))

      peer.on('connection', (conn: DataConnection) => {
        live.current.conn = conn

        conn.on('open', () => {
          const state = live.current.state
          if (state) conn.send({ type: 'GAME_STATE', state } as PeerMessage)
          setStatus('playing')
        })

        conn.on('data', (raw: unknown) => {
          const msg = raw as PeerMessage
          if (msg.type !== 'SUBMIT_PLAN') return

          const current = live.current.state
          if (!current) return

          // Implicit ACK validation: discard packets from older states
          if (msg.plan.turn !== current.turn || msg.plan.phase !== current.phase) {
            return
          }

          live.current.clientPendingPlan = msg.plan
          checkExecutionTrigger()
        })

        conn.on('close', onDisconnect)
        conn.on('error', onDisconnect)
      })

      peer.on('error', (err: Error & { type: string }) => {
        if (err.type === 'unavailable-id') onError('Room code already in use.')
        else onError(err.message || 'Connection error.')
      })
    } else {
      peer.on('open', () => {
        const conn = peer.connect(`hex-tag-${roomCode}`, { reliable: true })
        live.current.conn = conn
        setStatus('waiting_for_level')

        conn.on('data', (raw: unknown) => {
          const msg = raw as PeerMessage
          if (msg.type === 'GAME_STATE') {
            syncState(msg.state)
            setWaitingForPartner(false)
            setStatus('playing')
          }
        })

        conn.on('close', onDisconnect)
        conn.on('error', onDisconnect)
      })

      peer.on('error', (err: Error & { type: string }) => {
        if (err.type === 'peer-unavailable') onError('Room not found. Check the room code.')
        else onError(err.message || 'Connection error.')
      })
    }

    return () => {
      live.current.conn?.close()
      peer.destroy()
    }
  }, [roomCode, playerRole, settings, syncState, checkExecutionTrigger])

  const submitPlan = useCallback((plan: TurnPlan) => {
    if (playerRole === 1) {
      const current = live.current.state
      if (!current) return

      live.current.hostPendingPlan = plan
      setWaitingForPartner(true)
      checkExecutionTrigger()
    } else {
      live.current.conn?.send({ type: 'SUBMIT_PLAN', plan } as PeerMessage)
      setWaitingForPartner(true)
    }
  }, [playerRole, checkExecutionTrigger])

  return { gameState, status, errorMsg, waitingForPartner, submitPlan }
}
