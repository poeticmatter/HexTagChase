import { useState } from 'react'
import { POWER_OPTIONS } from '../lib/matchConfig'
import type { LobbySettings, PowerSelection } from '../lib/matchConfig'

interface LobbyFormState {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  chaserPowerSelection: PowerSelection
  evaderPowerSelection: PowerSelection
}

const DEFAULT_FORM: LobbyFormState = {
  maxTurns: 15,
  hostRole: 'Chaser',
  chaserPowerSelection: 'Standard',
  evaderPowerSelection: 'Standard',
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
          Two-player tag on a hex grid. Both players secretly pre-commit their full plan
          — moves plus a prediction of what the opponent will do. Correct predictions block
          the opponent's bonus move and trigger your own.
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

        {/* Power selections */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Powers
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-red-400 font-medium">Chaser</span>
              <PowerDropdown
                value={form.chaserPowerSelection}
                onChange={v => setForm(f => ({ ...f, chaserPowerSelection: v }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-blue-400 font-medium">Evader</span>
              <PowerDropdown
                value={form.evaderPowerSelection}
                onChange={v => setForm(f => ({ ...f, evaderPowerSelection: v }))}
              />
            </div>
          </div>
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

interface PowerDropdownProps {
  value: PowerSelection
  onChange: (value: PowerSelection) => void
}

function PowerDropdown({ value, onChange }: PowerDropdownProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as PowerSelection)}
      className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-neutral-500"
    >
      {POWER_OPTIONS.map(p => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  )
}
