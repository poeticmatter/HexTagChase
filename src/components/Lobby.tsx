import { useState } from 'react'
import type { LobbySettings } from '../lib/matchConfig'
import { mapRegistry } from '../lib/mapRegistry'
import { MapThumbnail } from './MapThumbnail'
import type { SimulationAgent } from '../lib/simulationAgent'

interface LobbyFormState {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  baseMovement: 1 | 2
  mapId: string
  opponentType: 'human' | 'ai'
  aiStrategy: SimulationAgent
}

const DEFAULT_FORM: LobbyFormState = {
  maxTurns: 15,
  hostRole: 'Chaser',
  baseMovement: 2,
  mapId: mapRegistry.getAllMaps()[0].id,
  opponentType: 'human',
  aiStrategy: 'greedy',
}

const AI_STRATEGY_LABELS: Record<SimulationAgent, string> = {
  random:    'Random',
  greedy:    'Greedy',
  lookahead: 'Lookahead',
}

interface Props {
  onCreateGame: (settings: LobbySettings) => void
  onPlayVsAI: (settings: LobbySettings, aiStrategy: SimulationAgent) => void
  onOpenSimulator?: () => void
}

export function Lobby({ onCreateGame, onPlayVsAI, onOpenSimulator }: Props) {
  const [form, setForm] = useState<LobbyFormState>(DEFAULT_FORM)

  const lobbySettings: LobbySettings = {
    maxTurns: form.maxTurns,
    hostRole: form.hostRole,
    baseMovement: form.baseMovement,
    mapId: form.mapId,
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center text-white font-sans gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-5xl font-bold tracking-tight">Hex Tag</h1>
        <p className="text-neutral-400 text-center max-w-sm leading-relaxed text-sm">
          Two-player tag on a hex grid. Both players secretly pre-commit their moves.
          Predict your opponent's destination — a correct prediction earns a bonus move.
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

        {/* Opponent */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Opponent
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {(['human', 'ai'] as const).map(type => (
              <button
                key={type}
                onClick={() => setForm(f => ({ ...f, opponentType: type }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors capitalize ${
                  form.opponentType === type
                    ? 'bg-neutral-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {type === 'human' ? 'Human' : 'AI'}
              </button>
            ))}
          </div>

          {form.opponentType === 'ai' && (
            <div className="flex rounded-lg overflow-hidden border border-neutral-700 mt-1">
              {(['random', 'greedy', 'lookahead'] as SimulationAgent[]).map(strategy => (
                <button
                  key={strategy}
                  onClick={() => setForm(f => ({ ...f, aiStrategy: strategy }))}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    form.aiStrategy === strategy
                      ? 'bg-indigo-700 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {AI_STRATEGY_LABELS[strategy]}
                </button>
              ))}
            </div>
          )}
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
        {onOpenSimulator && (
          <button
            onClick={onOpenSimulator}
            className="px-6 py-3 bg-indigo-700 hover:bg-indigo-600 rounded-xl text-neutral-200 font-semibold text-sm transition-colors"
          >
            Simulate
          </button>
        )}

        <button
          onClick={() => { window.location.href = '?editor=true' }}
          className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-neutral-200 font-semibold text-sm transition-colors"
        >
          Map Editor
        </button>

        {form.opponentType === 'ai' ? (
          <button
            onClick={() => onPlayVsAI(lobbySettings, form.aiStrategy)}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold text-lg transition-colors"
          >
            Play vs AI
          </button>
        ) : (
          <button
            onClick={() => onCreateGame(lobbySettings)}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-lg transition-colors"
          >
            Create Game
          </button>
        )}
      </div>
    </div>
  )
}
