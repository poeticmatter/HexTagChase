import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { DataConnection } from 'peerjs'
import type { GameState, TurnPlan, ConnectionStatus } from '../types'
import { getInitialPositions, generateObstacles, generateWalls, processPhase } from '../lib/hexGameLogic'
import { getPowerStrategy } from '../lib/powers/PowerFactory'

type PeerMessage =
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'SUBMIT_PLAN'; plan: TurnPlan }

function buildInitialState(): GameState {
  const { chaserPos, evaderPos } = getInitialPositions()

  const obstacles = generateObstacles(chaserPos, evaderPos)
  const walls = generateWalls(chaserPos, evaderPos, obstacles)

  const chaserPower = 'Standard' as const
  const evaderPower = 'Standard' as const
  const chaserStrat = getPowerStrategy(chaserPower)
  const evaderStrat = getPowerStrategy(evaderPower)

  let phase: GameState['phase'] = 'planning'
  if (chaserStrat.requiresPhase('declaring') || evaderStrat.requiresPhase('declaring')) {
    phase = 'declaring'
  }

  const turnSchema: GameState['turnSchema'] = {
    chaser: { requiredSteps: chaserStrat.getRequiredSteps(phase) },
    evader: { requiredSteps: evaderStrat.getRequiredSteps(phase) },
  }

  return {
    chaserPos,
    evaderPos,
    prevChaserPath: null,
    prevEvaderPath: null,
    phase,
    turn: 1,
    winner: null,
    obstacles,
    walls,
    chaserPower,
    evaderPower,
    modifiers: [],
    transientContext: {},
    turnSchema,
    p1Plan: null,
    p2Plan: null,
    lastResolution: null,
  }
}

export function useHexGame(roomCode: string, playerRole: 1 | 2) {
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

    const hostSchema = current.turnSchema.chaser
    const clientSchema = current.turnSchema.evader

    const hostReady = hostSchema.requiredSteps.length === 0 || live.current.hostPendingPlan !== null
    const clientReady = clientSchema.requiredSteps.length === 0 || live.current.clientPendingPlan !== null

    if (hostReady && clientReady) {
      const p1Plan = live.current.hostPendingPlan
      const p2Plan = live.current.clientPendingPlan

      const nextState = processPhase(current, p1Plan, p2Plan)

      // Clear pending plans for the next phase
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
      syncState(buildInitialState())
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

          // Implicit ACK validation: Discard packets from older states
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
  }, [roomCode, playerRole, syncState, checkExecutionTrigger])

  const submitPlan = useCallback((plan: TurnPlan) => {
    if (playerRole === 1) {
      const current = live.current.state
      if (!current) return

      live.current.hostPendingPlan = plan
      // Show waiting indicator if the execution trigger doesn't fire immediately
      setWaitingForPartner(true)
      checkExecutionTrigger()
    } else {
      live.current.conn?.send({ type: 'SUBMIT_PLAN', plan } as PeerMessage)
      setWaitingForPartner(true)
    }
  }, [playerRole, checkExecutionTrigger])

  return { gameState, status, errorMsg, waitingForPartner, submitPlan }
}
