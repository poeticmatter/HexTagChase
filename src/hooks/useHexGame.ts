import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { DataConnection } from 'peerjs'
import type { GameState, TurnPlan, ConnectionStatus, MatchSettings, UserRole, DraftPlan, SpectatorDrafts } from '../types'
import { processPhase, buildNextRoundState, buildInitialState } from '../lib/hexGameLogic'

// ── Reconnection policy ───────────────────────────────────────────────────────

/** Maximum number of client-side reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5

// ── ICE server config ─────────────────────────────────────────────────────────

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

const RECONNECT_BASE_DELAY_MS = 1500

// ── Wire protocol ─────────────────────────────────────────────────────────────

type PeerMessage =
  | { type: 'GAME_STATE'; state: GameState; spectatorCount?: number }
  | { type: 'SUBMIT_PLAN'; plan: TurnPlan }
  | { type: 'REQUEST_STATE'; lastTurn: number }
  | { type: 'ASSIGNED_ROLE'; role: UserRole; spectatorCount: number }
  | { type: 'SPECTATOR_COUNT'; spectatorCount: number }
  | { type: 'DRAFT_UPDATE'; playerRole: 1 | 2; draft: DraftPlan | null }

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHexGame(roomCode: string, playerRole: 1 | 2, settings: MatchSettings | null) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [waitingForPartner, setWaitingForPartner] = useState(false)
  const [assignedRole, setAssignedRole] = useState<UserRole>(playerRole === 1 ? 1 : 2)
  const [spectatorCount, setSpectatorCount] = useState<number>(0)
  const [spectatorDrafts, setSpectatorDrafts] = useState<SpectatorDrafts>({
    chaserDraft: null,
    evaderDraft: null,
  })

  const live = useRef({
    state: null as GameState | null,
    player2Conn: null as DataConnection | null,
    spectatorConns: new Set<DataConnection>(),
    clientConn: null as DataConnection | null, // client side handle to host
    hostPendingPlan: null as TurnPlan | null,
    clientPendingPlan: null as TurnPlan | null,
    hostDraft: null as DraftPlan | null,
    clientDraft: null as DraftPlan | null,
  })

  const reconnectAttempts = useRef(0)
  const activePeer = useRef<Peer | null>(null)

  const syncState = useCallback((next: GameState) => {
    live.current.state = next
    setGameState(next)
  }, [])

  const broadcastToAll = useCallback((msg: PeerMessage) => {
    if (live.current.player2Conn?.open) {
      live.current.player2Conn.send(msg)
    }
    live.current.spectatorConns.forEach((sConn) => {
      if (sConn.open) {
        sConn.send(msg)
      }
    })
  }, [])

  const updateSpectatorDraftState = useCallback((pRole: 1 | 2, draft: DraftPlan | null, state: GameState | null) => {
    if (!state) return
    const isChaser = state.settings.chaserPlayer === pRole
    setSpectatorDrafts(prev => {
      if (isChaser) {
        return { ...prev, chaserDraft: draft }
      } else {
        return { ...prev, evaderDraft: draft }
      }
    })
  }, [])

  const checkExecutionTrigger = useCallback(() => {
    const current = live.current.state
    if (!current) return

    const hostIsChaser = current.settings.chaserPlayer === 1
    const hostSchema = hostIsChaser ? current.turnSchema.chaser : current.turnSchema.evader
    const clientSchema = hostIsChaser ? current.turnSchema.evader : current.turnSchema.chaser

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
      live.current.hostDraft = null
      live.current.clientDraft = null
      setWaitingForPartner(false)
      setSpectatorDrafts({ chaserDraft: null, evaderDraft: null })

      syncState(nextState)
      broadcastToAll({
        type: 'GAME_STATE',
        state: nextState,
        spectatorCount: live.current.spectatorConns.size,
      })
      broadcastToAll({ type: 'DRAFT_UPDATE', playerRole: 1, draft: null })
      broadcastToAll({ type: 'DRAFT_UPDATE', playerRole: 2, draft: null })
    }
  }, [syncState, broadcastToAll])

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    if (playerRole === 1) {
      // ── Host path ─────────────────────────────────────────────────────────
      if (!settings) return

      const peer = new Peer(`hex-tag-${roomCode}`, { config: ICE_CONFIG })
      activePeer.current = peer
      syncState(buildInitialState(settings))

      peer.on('open', () => setStatus('waiting_for_partner'))

      peer.on('connection', (conn: DataConnection) => {
        conn.on('open', () => {
          const state = live.current.state
          const player2Active = live.current.player2Conn !== null && live.current.player2Conn.open

          if (!player2Active) {
            live.current.player2Conn = conn
            conn.send({
              type: 'ASSIGNED_ROLE',
              role: 2,
              spectatorCount: live.current.spectatorConns.size,
            } as PeerMessage)
            if (state) {
              conn.send({
                type: 'GAME_STATE',
                state,
                spectatorCount: live.current.spectatorConns.size,
              } as PeerMessage)
            }
            setStatus('playing')
          } else {
            live.current.spectatorConns.add(conn)
            setSpectatorCount(live.current.spectatorConns.size)
            conn.send({
              type: 'ASSIGNED_ROLE',
              role: 'spectator',
              spectatorCount: live.current.spectatorConns.size,
            } as PeerMessage)
            if (state) {
              conn.send({
                type: 'GAME_STATE',
                state,
                spectatorCount: live.current.spectatorConns.size,
              } as PeerMessage)
              if (live.current.hostDraft) {
                conn.send({ type: 'DRAFT_UPDATE', playerRole: 1, draft: live.current.hostDraft } as PeerMessage)
              }
              if (live.current.clientDraft) {
                conn.send({ type: 'DRAFT_UPDATE', playerRole: 2, draft: live.current.clientDraft } as PeerMessage)
              }
            }
            broadcastToAll({
              type: 'SPECTATOR_COUNT',
              spectatorCount: live.current.spectatorConns.size,
            })
          }
        })

        conn.on('data', (raw: unknown) => {
          const msg = raw as PeerMessage
          const current = live.current.state
          if (!current) return

          if (msg.type === 'REQUEST_STATE') {
            const clientIsAhead = msg.lastTurn > current.turn

            if (clientIsAhead) {
              console.warn(
                `[useHexGame] REQUEST_STATE rejected: client at (turn=${msg.lastTurn}) is ahead of host at (turn=${current.turn}).`
              )
              return
            }

            if (conn === live.current.player2Conn) {
              live.current.clientPendingPlan = null
              setWaitingForPartner(false)
            }

            conn.send({
              type: 'GAME_STATE',
              state: current,
              spectatorCount: live.current.spectatorConns.size,
            } as PeerMessage)
            return
          }

          if (msg.type === 'DRAFT_UPDATE') {
            if (conn === live.current.player2Conn) {
              live.current.clientDraft = msg.draft
              // Forward draft update from Player 2 to all spectators
              live.current.spectatorConns.forEach((sConn) => {
                if (sConn.open) {
                  sConn.send({ type: 'DRAFT_UPDATE', playerRole: 2, draft: msg.draft } as PeerMessage)
                }
              })
            }
            return
          }

          if (msg.type !== 'SUBMIT_PLAN') return
          if (conn !== live.current.player2Conn) return
          if (msg.plan.turn !== current.turn) return

          live.current.clientPendingPlan = msg.plan
          checkExecutionTrigger()
        })

        conn.on('close', () => {
          if (live.current.player2Conn === conn) {
            live.current.player2Conn = null
          } else if (live.current.spectatorConns.has(conn)) {
            live.current.spectatorConns.delete(conn)
            setSpectatorCount(live.current.spectatorConns.size)
            broadcastToAll({
              type: 'SPECTATOR_COUNT',
              spectatorCount: live.current.spectatorConns.size,
            })
          }
        })

        conn.on('error', () => {
          if (live.current.player2Conn === conn) {
            live.current.player2Conn = null
          } else if (live.current.spectatorConns.has(conn)) {
            live.current.spectatorConns.delete(conn)
            setSpectatorCount(live.current.spectatorConns.size)
            broadcastToAll({
              type: 'SPECTATOR_COUNT',
              spectatorCount: live.current.spectatorConns.size,
            })
          }
        })
      })

      peer.on('error', (err: Error & { type: string }) => {
        if (err.type === 'unavailable-id') {
          setErrorMsg('Room code already in use.')
        } else {
          setErrorMsg(err.message || 'Connection error.')
        }
        setStatus('error')
      })

      return () => {
        live.current.player2Conn?.close()
        live.current.spectatorConns.forEach((sConn) => sConn.close())
        peer.destroy()
        activePeer.current = null
      }
    } else {
      // ── Client path ───────────────────────────────────────────────────────
      function scheduleReconnect() {
        if (reconnectTimer !== null) return

        if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          setStatus('disconnected')
          return
        }

        reconnectAttempts.current++
        setStatus('reconnecting')

        activePeer.current?.destroy()
        activePeer.current = null

        const delay = reconnectAttempts.current * RECONNECT_BASE_DELAY_MS
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          attemptConnection()
        }, delay)
      }

      function attemptConnection() {
        const isReconnecting = reconnectAttempts.current > 0
        const clientPeer = new Peer(undefined, { config: ICE_CONFIG })
        activePeer.current = clientPeer

        clientPeer.on('open', () => {
          const conn = clientPeer.connect(`hex-tag-${roomCode}`, { reliable: true })
          live.current.clientConn = conn

          if (!isReconnecting) {
            setStatus('waiting_for_level')
          }

          conn.on('open', () => {
            if (isReconnecting) {
              const lastState = live.current.state
              conn.send({
                type: 'REQUEST_STATE',
                lastTurn: lastState?.turn ?? 0,
              } as PeerMessage)
            }
          })

          conn.on('data', (raw: unknown) => {
            const msg = raw as PeerMessage
            if (msg.type === 'ASSIGNED_ROLE') {
              setAssignedRole(msg.role)
              setSpectatorCount(msg.spectatorCount)
              if (msg.role === 'spectator') {
                setStatus('spectating')
              } else {
                setStatus('playing')
              }
            } else if (msg.type === 'SPECTATOR_COUNT') {
              setSpectatorCount(msg.spectatorCount)
            } else if (msg.type === 'DRAFT_UPDATE') {
              updateSpectatorDraftState(msg.playerRole, msg.draft, live.current.state)
            } else if (msg.type === 'GAME_STATE') {
              syncState(msg.state)
              setWaitingForPartner(false)
              if (msg.spectatorCount !== undefined) {
                setSpectatorCount(msg.spectatorCount)
              }
              setAssignedRole(prevRole => {
                if (prevRole === 'spectator') {
                  setStatus('spectating')
                } else {
                  setStatus('playing')
                }
                return prevRole
              })
              reconnectAttempts.current = 0
            }
          })

          conn.on('close', scheduleReconnect)
          conn.on('error', scheduleReconnect)
        })

        clientPeer.on('error', (err: Error & { type: string }) => {
          if (err.type === 'peer-unavailable') {
            if (isReconnecting) {
              scheduleReconnect()
            } else {
              setErrorMsg('Room not found. Check the room code.')
              setStatus('error')
            }
          } else {
            setErrorMsg(err.message || 'Connection error.')
            setStatus('error')
          }
        })
      }

      attemptConnection()

      return () => {
        if (reconnectTimer !== null) clearTimeout(reconnectTimer)
        live.current.clientConn?.close()
        activePeer.current?.destroy()
        activePeer.current = null
      }
    }
  }, [roomCode, playerRole, settings, syncState, checkExecutionTrigger, broadcastToAll, updateSpectatorDraftState])

  const sendDraftUpdate = useCallback((draft: DraftPlan) => {
    if (assignedRole === 'spectator') return

    if (playerRole === 1) {
      live.current.hostDraft = draft
      // Broadcast Host's draft to all spectators
      live.current.spectatorConns.forEach((sConn) => {
        if (sConn.open) {
          sConn.send({ type: 'DRAFT_UPDATE', playerRole: 1, draft } as PeerMessage)
        }
      })
    } else {
      live.current.clientConn?.send({ type: 'DRAFT_UPDATE', playerRole: 2, draft } as PeerMessage)
    }
  }, [assignedRole, playerRole])

  const submitPlan = useCallback((plan: TurnPlan) => {
    if (assignedRole === 'spectator') return

    if (playerRole === 1) {
      const current = live.current.state
      if (!current) return

      live.current.hostPendingPlan = plan
      setWaitingForPartner(true)
      checkExecutionTrigger()
    } else {
      live.current.clientConn?.send({ type: 'SUBMIT_PLAN', plan } as PeerMessage)
      setWaitingForPartner(true)
    }
  }, [assignedRole, playerRole, checkExecutionTrigger])

  const startNextRound = useCallback(() => {
    if (playerRole !== 1) return
    const current = live.current.state
    if (!current) return

    const nextState = buildNextRoundState(current)
    live.current.hostDraft = null
    live.current.clientDraft = null
    setSpectatorDrafts({ chaserDraft: null, evaderDraft: null })

    syncState(nextState)
    broadcastToAll({
      type: 'GAME_STATE',
      state: nextState,
      spectatorCount: live.current.spectatorConns.size,
    })
    broadcastToAll({ type: 'DRAFT_UPDATE', playerRole: 1, draft: null })
    broadcastToAll({ type: 'DRAFT_UPDATE', playerRole: 2, draft: null })
  }, [playerRole, syncState, broadcastToAll])

  return {
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
  }
}
