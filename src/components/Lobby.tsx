import { useState } from 'react'
import { BONUS_TIMING_OPTIONS } from '../lib/matchConfig'
import type { LobbySettings, BonusTiming } from '../lib/matchConfig'

interface LobbyFormState {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  bonusTiming: BonusTiming
  obstacleCount: number
  wallCount: number
}

const DEFAULT_FORM: LobbyFormState = {
  maxTurns: 15,
  hostRole: 'Chaser',
  bonusTiming: 'pre-commit',
  obstacleCount: 12,
  wallCount: 0,
}

const BONUS_TIMING_DESCRIPTIONS: Record<BonusTiming, string> = {
  'pre-commit': 'Both players pre-commit a bonus move. Chaser prediction hit → chaser bonus; miss → evader bonus.',
  'post-reveal': 'Moves resolve first. Then only the entitled player selects their bonus move.',
}

interface Props {
  onCreateGame: (settings: LobbySettings) => void
}

export function Lobby({ onCreateGame }: Props) {
  const [form, setForm] = useState<LobbyFormState>(DEFAULT_FORM)

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-sans gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-5xl font-bold tracking-tight">Hex Tag</h1>
        <p className="text-neutral-400 text-center max-w-sm leading-relaxed text-sm">
          Two-player tag on a hex grid. Both players secretly pre-commit their moves.
          The chaser predicts the evader's destination — a correct prediction earns a bonus move.
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Turn limit */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Turn Limit
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={20}
              value={form.maxTurns}
              onChange={e => setForm(f => ({ ...f, maxTurns: Number(e.target.value) }))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono text-neutral-200 w-6 text-right">
              {form.maxTurns}
            </span>
          </div>
        </div>

        {/* Host role */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Your Role
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {(['Chaser', 'Evader'] as const).map(role => (
              <button
                key={role}
                onClick={() => setForm(f => ({ ...f, hostRole: role }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  form.hostRole === role
                    ? role === 'Chaser'
                      ? 'bg-red-700 text-white'
                      : 'bg-blue-700 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* Bonus timing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Bonus Timing
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {BONUS_TIMING_OPTIONS.map(option => (
              <button
                key={option}
                onClick={() => setForm(f => ({ ...f, bonusTiming: option }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  form.bonusTiming === option
                    ? 'bg-neutral-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            {BONUS_TIMING_DESCRIPTIONS[form.bonusTiming]}
          </p>
        </div>

        {/* Obstacle density */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Obstacles
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={20}
              value={form.obstacleCount}
              onChange={e => setForm(f => ({ ...f, obstacleCount: Number(e.target.value) }))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono text-neutral-200 w-6 text-right">
              {form.obstacleCount}
            </span>
          </div>
        </div>

        {/* Wall density */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Wall Sections
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={4}
              value={form.wallCount}
              onChange={e => setForm(f => ({ ...f, wallCount: Number(e.target.value) }))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-sm font-mono text-neutral-200 w-6 text-right">
              {form.wallCount}
            </span>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Each section is a connected group of 4–6 soft-wall edges. Players can cross a wall by spending their full movement budget on that single step.
          </p>
        </div>
      </div>

      <button
        onClick={() => onCreateGame(form)}
        className="mt-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg transition-colors"
      >
        Create Game
      </button>
    </div>
  )
}
