import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { DataConnection } from 'peerjs'
import type { GameState, TurnPlan, ConnectionStatus } from '../types'
import { getInitialPositions, generateObstacles, generateWalls, resolveRound } from '../lib/hexGameLogic'

type PeerMessage =
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'SUBMIT_PLAN'; plan: TurnPlan }

function buildInitialState(): GameState {
  const { chaserPos, evaderPos } = getInitialPositions()

  const obstacles = generateObstacles(chaserPos, evaderPos)
  const walls = generateWalls(chaserPos, evaderPos, obstacles)

  return {
    chaserPos,
    evaderPos,
    prevChaserPath: null,
    prevEvaderPath: null,
    phase: 'planning',
    turn: 1,
    winner: null,
    obstacles,
    walls,
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
    pendingP2Plan: null as TurnPlan | null,
  })

  const syncState = useCallback((next: GameState) => {
    live.current.state = next
    setGameState(next)
  }, [])

  const resolveRoundAndSync = useCallback((p1Plan: TurnPlan, p2Plan: TurnPlan) => {
    const current = live.current.state
    if (!current) return

    const nextState = resolveRound(current, p1Plan, p2Plan)
    syncState(nextState)
    live.current.pendingP2Plan = null
    setWaitingForPartner(false)
    live.current.conn?.send({ type: 'GAME_STATE', state: nextState } as PeerMessage)
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

          live.current.pendingP2Plan = msg.plan
          const current = live.current.state
          if (current?.p1Plan) {
            resolveRoundAndSync(current.p1Plan, msg.plan)
          }
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
  }, [roomCode, playerRole, syncState, resolveRoundAndSync])

  const submitPlan = useCallback((plan: TurnPlan) => {
    if (playerRole === 1) {
      const current = live.current.state
      if (!current) return

      const p2Plan = live.current.pendingP2Plan
      if (p2Plan) {
        resolveRoundAndSync(plan, p2Plan)
      } else {
        syncState({ ...current, p1Plan: plan })
        setWaitingForPartner(true)
      }
    } else {
      live.current.conn?.send({ type: 'SUBMIT_PLAN', plan } as PeerMessage)
      setWaitingForPartner(true)
    }
  }, [playerRole, syncState, resolveRoundAndSync])

  return { gameState, status, errorMsg, waitingForPartner, submitPlan }
}
