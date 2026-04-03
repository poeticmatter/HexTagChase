import { useState, useEffect, useRef, useCallback } from 'react'
import Peer, { DataConnection } from 'peerjs'
import type { GameState, TurnPlan, ConnectionStatus, MatchSettings, GamePhase } from '../types'
import { processPhase, buildPlanningSchema, buildNextRoundState } from '../lib/hexGameLogic'
import { mapRegistry } from '../lib/mapRegistry'

// ── Reconnection policy ───────────────────────────────────────────────────────

/** Maximum number of client-side reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5

/**
 * Base delay multiplier in ms. Actual delay = attempt * BASE.
 * Attempt 1 → 1.5 s, 2 → 3 s, …, 5 → 7.5 s.
 */
const RECONNECT_BASE_DELAY_MS = 1500

// ── Wire protocol ─────────────────────────────────────────────────────────────

type PeerMessage =
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'SUBMIT_PLAN'; plan: TurnPlan }
  /**
   * Sent by a reconnecting client to request the host's authoritative state.
   * lastTurn / lastPhase are the client's last known sequence position, used
   * by the host to detect stale injection attempts.
   */
  | { type: 'REQUEST_STATE'; lastTurn: number; lastPhase: GamePhase }

// ── State builder ─────────────────────────────────────────────────────────────

function buildInitialState(settings: MatchSettings): GameState {
  const mapDef = mapRegistry.getMapById(settings.mapId)
  if (!mapDef) {
    throw new Error(`Map with id "${settings.mapId}" not found in registry.`)
  }

  return {
    settings,
    matchState: { roundNumber: 1, history: [], matchWinner: null },
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

// ── Hook ──────────────────────────────────────────────────────────────────────

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

  // Tracks how many reconnect attempts the client has made in the current session.
  const reconnectAttempts = useRef(0)

  // Holds the active Peer instance for both roles so the cleanup path is unified.
  const activePeer = useRef<Peer | null>(null)

  const syncState = useCallback((next: GameState) => {
    live.current.state = next
    setGameState(next)
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
      setWaitingForPartner(false)

      syncState(nextState)
      live.current.conn?.send({ type: 'GAME_STATE', state: nextState } as PeerMessage)
    }
  }, [syncState])

  useEffect(() => {
    // Shared cleanup handle — ensures any pending reconnect timer is cancelled
    // if the component unmounts while the client is in the reconnecting state.
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    if (playerRole === 1) {
      // ── Host path ─────────────────────────────────────────────────────────
      //
      // The host peer lives for the full session. When the client drops, we
      // null out the connection handle and wait — the same peer ID remains
      // claimed on the PeerJS broker, so the client can reconnect using the
      // same room code without any host-side teardown.

      if (!settings) return

      const peer = new Peer(`hex-tag-${roomCode}`)
      activePeer.current = peer
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
          const current = live.current.state
          if (!current) return

          if (msg.type === 'REQUEST_STATE') {
            // ── Sequence guard ─────────────────────────────────────────────
            // Reject the handshake if the client claims to be ahead of the
            // host. The only way this could occur is a stale or malformed
            // packet — sending the host state back would roll back progress.
            const clientIsAhead =
              msg.lastTurn > current.turn ||
              (msg.lastTurn === current.turn &&
                msg.lastPhase === 'bonus_phase' &&
                current.phase === 'planning')

            if (clientIsAhead) {
              console.warn(
                `[useHexGame] REQUEST_STATE rejected: client at (turn=${msg.lastTurn}, phase=${msg.lastPhase}) is ahead of host at (turn=${current.turn}, phase=${current.phase}).`
              )
              return
            }

            // Discard any pending plan from the old connection. If this plan
            // were retained, it could replay into the next checkExecutionTrigger
            // call and resolve a turn without the client's conscious re-submission.
            live.current.clientPendingPlan = null
            setWaitingForPartner(false)

            conn.send({ type: 'GAME_STATE', state: current } as PeerMessage)
            return
          }

          if (msg.type !== 'SUBMIT_PLAN') return

          // Implicit ACK: discard stale packets from a previous turn/phase.
          if (msg.plan.turn !== current.turn || msg.plan.phase !== current.phase) return

          live.current.clientPendingPlan = msg.plan
          checkExecutionTrigger()
        })

        conn.on('close', () => {
          // Client dropped. Keep the host peer alive — the client will reconnect.
          live.current.conn = null
        })
        conn.on('error', () => {
          live.current.conn = null
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
        live.current.conn?.close()
        peer.destroy()
        activePeer.current = null
      }
    } else {
      // ── Client path ───────────────────────────────────────────────────────
      //
      // Function declarations are hoisted within this closure, allowing the
      // mutual reference between scheduleReconnect → attemptConnection.

      function scheduleReconnect() {
        // Idempotency guard: if a timer is already pending do not queue another.
        if (reconnectTimer !== null) return

        if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          setStatus('disconnected')
          return
        }

        reconnectAttempts.current++
        setStatus('reconnecting')

        // Tear down the failed peer before creating a fresh one.
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
        const clientPeer = new Peer()
        activePeer.current = clientPeer

        clientPeer.on('open', () => {
          const conn = clientPeer.connect(`hex-tag-${roomCode}`, { reliable: true })
          live.current.conn = conn

          if (!isReconnecting) {
            setStatus('waiting_for_level')
          }

          conn.on('open', () => {
            if (isReconnecting) {
              // Handshake: send our last known sequence position so the host
              // can validate and respond with the authoritative current state.
              const lastState = live.current.state
              conn.send({
                type: 'REQUEST_STATE',
                lastTurn: lastState?.turn ?? 0,
                lastPhase: lastState?.phase ?? 'planning',
              } as PeerMessage)
            }
          })

          conn.on('data', (raw: unknown) => {
            const msg = raw as PeerMessage
            if (msg.type === 'GAME_STATE') {
              syncState(msg.state)
              setWaitingForPartner(false)
              setStatus('playing')
              // Reset the counter — we have a clean connection again.
              reconnectAttempts.current = 0
            }
          })

          conn.on('close', scheduleReconnect)
          conn.on('error', scheduleReconnect)
        })

        clientPeer.on('error', (err: Error & { type: string }) => {
          if (err.type === 'peer-unavailable') {
            if (isReconnecting) {
              // The host's peer ID may not be re-advertised yet — retry.
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
        live.current.conn?.close()
        activePeer.current?.destroy()
        activePeer.current = null
      }
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

  const startNextRound = useCallback(() => {
    if (playerRole !== 1) return
    const current = live.current.state
    if (!current) return

    const nextState = buildNextRoundState(current)
    syncState(nextState)
    live.current.conn?.send({ type: 'GAME_STATE', state: nextState } as PeerMessage)
  }, [playerRole, syncState])

  return { gameState, status, errorMsg, waitingForPartner, submitPlan, startNextRound }
}
