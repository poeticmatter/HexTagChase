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
  | { type: 'REQUEST_ROLE'; preferredRole?: 'player' | 'spectator' }
  | { type: 'ASSIGNED_ROLE'; role: UserRole; spectatorCount: number; availablePlayerSlots?: boolean }
  | { type: 'SPECTATOR_COUNT'; spectatorCount: number }
  | { type: 'DRAFT_UPDATE'; playerRole: 1 | 2; draft: DraftPlan | null }

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useHexGame(roomCode: string, initialRole: UserRole, settings: MatchSettings | null) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [waitingForPartner, setWaitingForPartner] = useState(false)
  const [assignedRole, setAssignedRole] = useState<UserRole>(initialRole)
  const [spectatorCount, setSpectatorCount] = useState<number>(0)
  const [availablePlayerSlots, setAvailablePlayerSlots] = useState<boolean>(false)
  const [spectatorDrafts, setSpectatorDrafts] = useState<SpectatorDrafts>({
    chaserDraft: null,
    evaderDraft: null,
  })

  const live = useRef({
    state: null as GameState | null,
    player1Conn: null as DataConnection | null,
    player2Conn: null as DataConnection | null,
    spectatorConns: new Set<DataConnection>(),
    clientConn: null as DataConnection | null, // client side handle to host
    hostPendingPlan: null as TurnPlan | null,
    p1PendingPlan: null as TurnPlan | null,
    p2PendingPlan: null as TurnPlan | null,
    p1Draft: null as DraftPlan | null,
    p2Draft: null as DraftPlan | null,
  })

  const reconnectAttempts = useRef(0)
  const activePeer = useRef<Peer | null>(null)

  const syncState = useCallback((next: GameState) => {
    live.current.state = next
    setGameState(next)
  }, [])

  const broadcastToAll = useCallback((msg: PeerMessage) => {
    if (live.current.player1Conn?.open) {
      live.current.player1Conn.send(msg)
    }
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
    const hostIsPlaying = (initialRole !== 'spectator')

    const p1Schema = current.turnSchema[hostIsChaser ? 'chaser' : 'evader']
    const p2Schema = current.turnSchema[hostIsChaser ? 'evader' : 'chaser']

    const p1Ready = p1Schema.requiredSteps.length === 0 || (hostIsPlaying ? live.current.hostPendingPlan !== null : live.current.p1PendingPlan !== null)
    const p2Ready = p2Schema.requiredSteps.length === 0 || live.current.p2PendingPlan !== null

    if (p1Ready && p2Ready) {
      const p1Plan = p1Schema.requiredSteps.length === 0 ? null : (hostIsPlaying ? live.current.hostPendingPlan : live.current.p1PendingPlan)
      const p2Plan = p2Schema.requiredSteps.length === 0 ? null : live.current.p2PendingPlan

      const nextState = processPhase(current, p1Plan, p2Plan)

      live.current.hostPendingPlan = null
      live.current.p1PendingPlan = null
      live.current.p2PendingPlan = null
      live.current.p1Draft = null
      live.current.p2Draft = null
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
  }, [syncState, broadcastToAll, initialRole])

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    if (settings !== null) {
      // ── Host path ─────────────────────────────────────────────────────────
      const peer = new Peer(`hex-tag-${roomCode}`, { config: ICE_CONFIG })
      activePeer.current = peer
      syncState(buildInitialState(settings))

      peer.on('open', () => {
        if (initialRole === 'spectator') {
          setStatus('spectating')
        } else {
          setStatus('waiting_for_partner')
        }
      })

      const assignConnRole = (conn: DataConnection, preferredRole?: 'player' | 'spectator') => {
        const hostIsPlaying = (initialRole !== 'spectator')
        const p1Active = hostIsPlaying || (live.current.player1Conn !== null && live.current.player1Conn.open && live.current.player1Conn !== conn)
        const p2Active = (live.current.player2Conn !== null && live.current.player2Conn.open && live.current.player2Conn !== conn)

        // Clear conn from previous assignment if re-assigning
        if (live.current.player1Conn === conn) live.current.player1Conn = null
        if (live.current.player2Conn === conn) live.current.player2Conn = null
        live.current.spectatorConns.delete(conn)

        let roleToAssign: UserRole = 'spectator'
        if (preferredRole === 'spectator') {
          roleToAssign = 'spectator'
        } else {
          if (!p1Active) roleToAssign = 1
          else if (!p2Active) roleToAssign = 2
          else roleToAssign = 'spectator'
        }

        if (roleToAssign === 1) {
          live.current.player1Conn = conn
        } else if (roleToAssign === 2) {
          live.current.player2Conn = conn
        } else {
          live.current.spectatorConns.add(conn)
          setSpectatorCount(live.current.spectatorConns.size)
        }

        const slotsOpen = (!p1Active || !p2Active)

        conn.send({
          type: 'ASSIGNED_ROLE',
          role: roleToAssign,
          spectatorCount: live.current.spectatorConns.size,
          availablePlayerSlots: slotsOpen,
        } as PeerMessage)

        const state = live.current.state
        if (state) {
          conn.send({
            type: 'GAME_STATE',
            state,
            spectatorCount: live.current.spectatorConns.size,
          } as PeerMessage)
          if (live.current.p1Draft) {
            conn.send({ type: 'DRAFT_UPDATE', playerRole: 1, draft: live.current.p1Draft } as PeerMessage)
          }
          if (live.current.p2Draft) {
            conn.send({ type: 'DRAFT_UPDATE', playerRole: 2, draft: live.current.p2Draft } as PeerMessage)
          }
        }

        if (hostIsPlaying && live.current.player2Conn?.open) {
          setStatus('playing')
        }

        broadcastToAll({
          type: 'SPECTATOR_COUNT',
          spectatorCount: live.current.spectatorConns.size,
        })
      }

      peer.on('connection', (conn: DataConnection) => {
        conn.on('open', () => {
          assignConnRole(conn)
        })

        conn.on('data', (raw: unknown) => {
          const msg = raw as PeerMessage
          const current = live.current.state
          if (!current) return

          if (msg.type === 'REQUEST_ROLE') {
            assignConnRole(conn, msg.preferredRole)
            return
          }

          if (msg.type === 'REQUEST_STATE') {
            const clientIsAhead = msg.lastTurn > current.turn

            if (clientIsAhead) {
              console.warn(
                `[useHexGame] REQUEST_STATE rejected: client at (turn=${msg.lastTurn}) is ahead of host at (turn=${current.turn}).`
              )
              return
            }

            if (conn === live.current.player1Conn) {
              live.current.p1PendingPlan = null
            } else if (conn === live.current.player2Conn) {
              live.current.p2PendingPlan = null
            }

            conn.send({
              type: 'GAME_STATE',
              state: current,
              spectatorCount: live.current.spectatorConns.size,
            } as PeerMessage)
            return
          }

          if (msg.type === 'DRAFT_UPDATE') {
            if (conn === live.current.player1Conn) {
              live.current.p1Draft = msg.draft
              updateSpectatorDraftState(1, msg.draft, current)
              live.current.spectatorConns.forEach((sConn) => {
                if (sConn.open) sConn.send({ type: 'DRAFT_UPDATE', playerRole: 1, draft: msg.draft } as PeerMessage)
              })
            } else if (conn === live.current.player2Conn) {
              live.current.p2Draft = msg.draft
              updateSpectatorDraftState(2, msg.draft, current)
              live.current.spectatorConns.forEach((sConn) => {
                if (sConn.open) sConn.send({ type: 'DRAFT_UPDATE', playerRole: 2, draft: msg.draft } as PeerMessage)
              })
            }
            return
          }

          if (msg.type !== 'SUBMIT_PLAN') return
          if (msg.plan.turn !== current.turn) return

          if (conn === live.current.player1Conn) {
            live.current.p1PendingPlan = msg.plan
            checkExecutionTrigger()
          } else if (conn === live.current.player2Conn) {
            live.current.p2PendingPlan = msg.plan
            checkExecutionTrigger()
          }
        })

        conn.on('close', () => {
          if (live.current.player1Conn === conn) live.current.player1Conn = null
          if (live.current.player2Conn === conn) live.current.player2Conn = null
          live.current.spectatorConns.delete(conn)
          setSpectatorCount(live.current.spectatorConns.size)
          broadcastToAll({
            type: 'SPECTATOR_COUNT',
            spectatorCount: live.current.spectatorConns.size,
          })
        })

        conn.on('error', () => {
          if (live.current.player1Conn === conn) live.current.player1Conn = null
          if (live.current.player2Conn === conn) live.current.player2Conn = null
          live.current.spectatorConns.delete(conn)
          setSpectatorCount(live.current.spectatorConns.size)
          broadcastToAll({
            type: 'SPECTATOR_COUNT',
            spectatorCount: live.current.spectatorConns.size,
          })
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
        live.current.player1Conn?.close()
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
              if (msg.availablePlayerSlots !== undefined) {
                setAvailablePlayerSlots(msg.availablePlayerSlots)
              }
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
  }, [roomCode, initialRole, settings, syncState, checkExecutionTrigger, broadcastToAll, updateSpectatorDraftState])

  const sendDraftUpdate = useCallback((draft: DraftPlan) => {
    if (assignedRole === 'spectator') return

    if (settings !== null) {
      live.current.p1Draft = draft
      updateSpectatorDraftState(1, draft, live.current.state)
      live.current.spectatorConns.forEach((sConn) => {
        if (sConn.open) {
          sConn.send({ type: 'DRAFT_UPDATE', playerRole: 1, draft } as PeerMessage)
        }
      })
    } else {
      live.current.clientConn?.send({ type: 'DRAFT_UPDATE', playerRole: (assignedRole === 2 ? 2 : 1), draft } as PeerMessage)
    }
  }, [assignedRole, settings, updateSpectatorDraftState])

  const submitPlan = useCallback((plan: TurnPlan) => {
    if (assignedRole === 'spectator') return

    if (settings !== null) {
      const current = live.current.state
      if (!current) return

      live.current.hostPendingPlan = plan
      setWaitingForPartner(true)
      checkExecutionTrigger()
    } else {
      live.current.clientConn?.send({ type: 'SUBMIT_PLAN', plan } as PeerMessage)
      setWaitingForPartner(true)
    }
  }, [assignedRole, settings, checkExecutionTrigger])

  const requestRole = useCallback((preferredRole: 'player' | 'spectator') => {
    if (live.current.clientConn?.open) {
      live.current.clientConn.send({ type: 'REQUEST_ROLE', preferredRole } as PeerMessage)
    }
  }, [])

  const startNextRound = useCallback(() => {
    if (settings === null) return
    const current = live.current.state
    if (!current) return

    const nextState = buildNextRoundState(current)
    live.current.p1Draft = null
    live.current.p2Draft = null
    setSpectatorDrafts({ chaserDraft: null, evaderDraft: null })

    syncState(nextState)
    broadcastToAll({
      type: 'GAME_STATE',
      state: nextState,
      spectatorCount: live.current.spectatorConns.size,
    })
    broadcastToAll({ type: 'DRAFT_UPDATE', playerRole: 1, draft: null })
    broadcastToAll({ type: 'DRAFT_UPDATE', playerRole: 2, draft: null })
  }, [settings, syncState, broadcastToAll])

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
    availablePlayerSlots,
    requestRole,
  }
}
