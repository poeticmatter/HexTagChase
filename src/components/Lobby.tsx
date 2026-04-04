import { useState } from 'react'
import type { LobbySettings } from '../lib/matchConfig'
import { mapRegistry } from '../lib/mapRegistry'
import { MapThumbnail } from './MapThumbnail'

interface LobbyFormState {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  baseMovement: 1 | 2
  mapId: string
}

const DEFAULT_FORM: LobbyFormState = {
  maxTurns: 15,
  hostRole: 'Chaser',
  baseMovement: 2,
  mapId: mapRegistry.getAllMaps()[0].id,
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

        {/* Base movement */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Base Movement
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {([1, 2] as const).map(option => (
              <button
                key={option}
                onClick={() => setForm(f => ({ ...f, baseMovement: option }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  form.baseMovement === option
                    ? 'bg-neutral-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Base movement points per turn.
          </p>
        </div>

        {/* Map Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Select Map
          </label>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {mapRegistry.getAllMaps().map(mapDef => (
              <div key={mapDef.id}>
                <MapThumbnail
                  mapDef={mapDef}
                  selected={form.mapId === mapDef.id}
                  onClick={() => setForm(f => ({ ...f, mapId: mapDef.id }))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-4 mt-2">
        <button
          onClick={() => { window.location.href = '?editor=true' }}
          className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-neutral-200 font-semibold text-sm transition-colors"
        >
          Map Editor
        </button>

        <button
          onClick={() => onCreateGame(form)}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg transition-colors"
        >
          Create Game
        </button>
      </div>
    </div>
  )
}
