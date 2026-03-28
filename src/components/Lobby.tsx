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

// ── Individual setting row ────────────────────────────────────────────────

interface SettingRowProps<T extends string> {
  label: string
  description: string
  value: T
  options: { label: string; value: T }[]
  onChange: (v: T) => void
}

function SettingRow<T extends string>({ label, description, value, options, onChange }: SettingRowProps<T>) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-neutral-800 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-neutral-200">{label}</span>
        <SegmentedToggle value={value} options={options} onChange={onChange} />
      </div>
      <p className="text-xs text-neutral-500 leading-relaxed">{description}</p>
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
          <SettingRow
            label="Grid type"
            description="Hex uses 6 directional movement. Square uses 4 cardinal directions. Square may be more readable; hex has richer directional space."
            value={settings.gridType}
            options={[
              { label: 'Hex', value: 'hex' },
              { label: 'Square', value: 'square' },
            ]}
            onChange={v => set('gridType', v)}
          />
          <SettingRow
            label="Steps per turn"
            description="2-step turns mean planning and predicting two moves each. 1-step is simpler — test whether the 2-step dynamic creates the interesting play."
            value={String(settings.moveSteps) as '1' | '2'}
            options={[
              { label: '2 steps', value: '2' },
              { label: '1 step', value: '1' },
            ]}
            onChange={v => set('moveSteps', Number(v) as 1 | 2)}
          />
          <SettingRow
            label="Prediction mode"
            description="Direction: predict which way your opponent moves. Destination: predict exact arrival hex. Destination can be easier in corridors — two paths can share a destination."
            value={settings.predictionTarget}
            options={[
              { label: 'Direction', value: 'direction' },
              { label: 'Destination', value: 'destination' },
            ]}
            onChange={v => set('predictionTarget', v)}
          />
          <SettingRow
            label="Prediction outcome"
            description="Freeze both: correct prediction freezes the opponent. Bonus both: correct prediction unlocks your own pre-committed bonus move. Freeze & bonus: chaser freezes evader, evader's correct prediction unlocks a bonus move instead."
            value={settings.predictionOutcome}
            options={[
              { label: 'Freeze both', value: 'freeze-both' },
              { label: 'Bonus both', value: 'bonus-both' },
              { label: 'Freeze & bonus', value: 'freeze-and-bonus' },
            ]}
            onChange={v => set('predictionOutcome', v)}
          />
          <SettingRow
            label="Evader objective"
            description="Survive: evader wins by lasting 20 turns. Collect: evader wins by collecting 4 of 6 tokens scattered near the chaser's start — tokens are fixed each game."
            value={settings.evaderObjective}
            options={[
              { label: 'Survive', value: 'survive' },
              { label: 'Collect', value: 'collect' },
            ]}
            onChange={v => set('evaderObjective', v)}
          />
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
