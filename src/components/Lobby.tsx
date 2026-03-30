import { useState } from 'react'
import type { GameSettings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

interface Props {
  onCreateGame: (settings: GameSettings) => void
}

// ── Segmented toggle (two-option picker) ──────────────────────────────────

interface ToggleProps<T extends string> {
  value: T
  options: { label: string; value: T }[]
  onChange: (v: T) => void
}

function SegmentedToggle<T extends string>({ value, options, onChange }: ToggleProps<T>) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-neutral-700 shrink-0">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Settings screen ───────────────────────────────────────────────────────

interface SettingsScreenProps {
  settings: GameSettings
  onChange: (s: GameSettings) => void
  onStart: () => void
  onBack: () => void
}

function SettingsScreen({ settings, onChange, onStart, onBack }: SettingsScreenProps) {
  function set<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-sans p-6">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Game Settings</h2>
          <p className="text-neutral-500 text-xs">
            Host only — sent to your opponent when they join
          </p>
        </div>

        <div className="rounded-xl border border-neutral-700 bg-neutral-800/30 px-4">
          {/* Role */}
          <div className="flex flex-col gap-1.5 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-neutral-200">Your role</span>
              <SegmentedToggle
                value={settings.hostRole}
                options={[
                  { label: 'Chaser', value: 'chaser' },
                  { label: 'Evader', value: 'evader' },
                ]}
                onChange={v => set('hostRole', v)}
              />
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              {settings.hostRole === 'chaser'
                ? 'You pursue the evader. Tag them to win.'
                : 'You evade the chaser. Survive long enough to win.'}
            </p>
          </div>

          {/* Obstacles */}
          <div className="flex flex-col gap-1.5 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-neutral-200">Obstacles</span>
              <SegmentedToggle
                value={settings.obstacleMode}
                options={[
                  { label: 'Hexes', value: 'hexes' },
                  { label: 'Walls', value: 'walls' },
                  { label: 'Both', value: 'both' },
                ]}
                onChange={v => set('obstacleMode', v)}
              />
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              {settings.obstacleMode === 'hexes' && 'Blocked cells — impassable territory scattered across the board.'}
              {settings.obstacleMode === 'walls' && 'Edge walls — invisible lines between cells that block passage in one direction.'}
              {settings.obstacleMode === 'both' && 'Blocked cells plus edge walls for a denser, more complex layout.'}
            </p>
          </div>

          {/* Turns to survive */}
          <div className="flex flex-col gap-2 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-neutral-200">Turns to survive</span>
              <span className="text-sm font-bold text-blue-400 tabular-nums w-6 text-right">
                {settings.maxTurns}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={20}
              step={1}
              value={settings.maxTurns}
              onChange={e => set('maxTurns', Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-neutral-600">
              <span>10</span>
              <span>20</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Evader wins by surviving this many turns without being tagged.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onStart}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-base transition-colors"
          >
            Start Game
          </button>
          <button
            onClick={onBack}
            className="w-full py-2 text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lobby screen ──────────────────────────────────────────────────────────

export function Lobby({ onCreateGame }: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS)

  if (showSettings) {
    return (
      <SettingsScreen
        settings={settings}
        onChange={setSettings}
        onStart={() => onCreateGame(settings)}
        onBack={() => setShowSettings(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-sans gap-6">
      <h1 className="text-5xl font-bold tracking-tight">Hex Tag</h1>
      <p className="text-neutral-400 text-center max-w-sm leading-relaxed text-sm">
        Two-player tag on a hex grid. Both players secretly pre-commit their full plan
        — moves plus a prediction of what the opponent will do. Correct predictions cancel
        the matching step of the opponent's movement.
      </p>
      <button
        onClick={() => setShowSettings(true)}
        className="mt-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg transition-colors"
      >
        Create Game
      </button>
    </div>
  )
}
