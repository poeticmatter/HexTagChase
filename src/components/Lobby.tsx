import { useState } from 'react'
import type { LobbySettings, Transport } from '../lib/matchConfig'
import { mapRegistry } from '../lib/mapRegistry'
import { MapThumbnail } from './MapThumbnail'

interface LobbyFormState {
  hostRole: 'Chaser' | 'Evader'
  mapId: string
  transport: Transport
  startingMovementPoints: number
}

const DEFAULT_FORM: LobbyFormState = {
  hostRole: 'Chaser',
  mapId: mapRegistry.getAllMaps()[0].id,
  transport: 'async',
  startingMovementPoints: 10,
}

const TRANSPORT_LABELS: Record<Transport, string> = {
  async: 'Async (Supabase)',
  live: 'Live (P2P)',
}

interface Props {
  onCreateGame: (settings: LobbySettings) => void
}

export function Lobby({ onCreateGame }: Props) {
  const [form, setForm] = useState<LobbyFormState>(DEFAULT_FORM)

  const lobbySettings: LobbySettings = {
    hostRole: form.hostRole,
    mapId: form.mapId,
    transport: form.transport,
    startingMovementPoints: form.startingMovementPoints,
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-sans gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-5xl font-bold tracking-tight">Hex Tag</h1>
        <p className="text-neutral-400 text-center max-w-sm leading-relaxed text-sm">
          Two-player tag on a hex grid. Both players secretly pre-commit their moves (1 or 2 steps).
          Predict your opponent's destination for +1 movement pool point, and collect goals for +2 points!
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Your role */}
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

        {/* Movement pool settings */}
        <div className="flex flex-col gap-2 p-3 bg-neutral-800 rounded-lg border border-neutral-700">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Evader Starting Pool
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={4}
                max={30}
                value={form.startingMovementPoints}
                onChange={e => setForm(f => ({ ...f, startingMovementPoints: Number(e.target.value) }))}
                className="flex-1 accent-teal-500"
              />
              <span className="text-sm font-mono text-neutral-200 w-6 text-right">
                {form.startingMovementPoints}
              </span>
            </div>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed">
            Chaser starts with +5 points ({form.startingMovementPoints + 5} pts). Moving costs pool points. Running out of points results in an instant loss!
          </p>
        </div>

        {/* Transport */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Play Mode
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {(['async', 'live'] as Transport[]).map(option => (
              <button
                key={option}
                onClick={() => setForm(f => ({ ...f, transport: option }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  form.transport === option
                    ? 'bg-neutral-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {TRANSPORT_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            {form.transport === 'async'
              ? 'Take turns at any time — state is saved online. Best for different time zones.'
              : 'Both players connect at the same time over a direct peer-to-peer link.'}
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

      <div className="flex gap-4 mt-2 flex-wrap justify-center">
        <button
          onClick={() => { window.location.href = '?editor=true' }}
          className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-neutral-200 font-semibold text-sm transition-colors"
        >
          Map Editor
        </button>

        <button
          onClick={() => onCreateGame(lobbySettings)}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg transition-colors"
        >
          Create Game
        </button>
      </div>
    </div>
  )
}
