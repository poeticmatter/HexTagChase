import { useState, useEffect, useCallback } from 'react'
import type { GameState, TurnPlan, ConnectionStatus, MatchSettings } from '../types'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  createGame,
  loadGame,
  joinGameAsPlayer2,
  submitPlan as submitPlanRemote,
  startNextRound as startNextRoundRemote,
  type GameRow,
} from '../lib/asyncGameApi'

/**
 * Supabase-backed transport for asynchronous play. Mirrors the public surface of
 * useHexGame so App's ActiveGame renders identically regardless of transport.
 *
 * Unlike the PeerJS host, no browser needs to stay online: the authoritative state
 * lives in the `games` row, turn resolution runs in whichever client submits second
 * (see asyncGameApi.submitPlan), and Realtime syncs the board to anyone watching.
 */

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Connection error.'
}

export function useHexGameAsync(
  roomCode: string,
  playerRole: 1 | 2,
  settings: MatchSettings | null,
) {
  const [row, setRow] = useState<GameRow | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setErrorMsg(
        'Async play is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).',
      )
      setStatus('error')
      return
    }

    let cancelled = false

    // Subscribe before the initial load so a concurrent change isn't missed; the
    // post-subscribe load then reconciles to the authoritative current row.
    const channel = getSupabase()
      .channel(`game:${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${roomCode}` },
        payload => {
          if (!cancelled) setRow(payload.new as GameRow)
        },
      )
      .subscribe()

    async function init() {
      try {
        if (playerRole === 1) {
          if (!settings) return
          let existing = await loadGame(roomCode)
          if (!existing) {
            await createGame(roomCode, settings)
            existing = await loadGame(roomCode)
          }
          if (!cancelled && existing) setRow(existing)
        } else {
          const existing = await loadGame(roomCode)
          if (!existing) {
            if (!cancelled) {
              setErrorMsg('Game not found. Check the link.')
              setStatus('error')
            }
            return
          }
          await joinGameAsPlayer2(roomCode)
          if (!cancelled) setRow({ ...existing, p2_joined: true })
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(errorMessage(err))
          setStatus('error')
        }
      }
    }

    init()

    return () => {
      cancelled = true
      getSupabase().removeChannel(channel)
    }
  }, [roomCode, playerRole, settings])

  // Derive connection status from the row. The host waits until the evader has joined.
  useEffect(() => {
    if (!row || status === 'error') return
    setStatus(playerRole === 1 && !row.p2_joined ? 'waiting_for_partner' : 'playing')
  }, [row, playerRole, status])

  const gameState: GameState | null = row?.state ?? null

  // A non-null pending plan for this player means we have committed and are waiting for
  // the opponent — plans are cleared on resolution, so this also survives a page reload.
  const myPlan = row ? (playerRole === 1 ? row.p1_plan : row.p2_plan) : null
  const waitingForPartner = myPlan !== null

  const submitPlan = useCallback(
    (plan: TurnPlan) => {
      const planKey = playerRole === 1 ? 'p1_plan' : 'p2_plan'
      // Optimistic: reflect our own commit immediately; Realtime delivers the
      // authoritative row (and any resulting resolution) right after.
      setRow(prev => (prev ? { ...prev, [planKey]: plan } : prev))

      submitPlanRemote(roomCode, playerRole, plan).catch(err => {
        setErrorMsg(errorMessage(err))
        setStatus('error')
      })
    },
    [roomCode, playerRole],
  )

  const startNextRound = useCallback(() => {
    const round = row?.state.matchState.roundNumber
    if (round == null) return

    startNextRoundRemote(roomCode, round).catch(err => {
      setErrorMsg(errorMessage(err))
      setStatus('error')
    })
  }, [roomCode, row])

  return { gameState, status, errorMsg, waitingForPartner, submitPlan, startNextRound }
}
