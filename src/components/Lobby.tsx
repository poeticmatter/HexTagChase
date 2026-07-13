import { useState } from 'react'
import type { LobbySettings, Transport } from '../lib/matchConfig'
import { mapRegistry } from '../lib/mapRegistry'
import { MapThumbnail } from './MapThumbnail'
import type { SimulationAgent } from '../lib/simulationAgent'
import type { MovementMode, WinCondition } from '../types'

interface LobbyFormState {
  maxTurns: number
  hostRole: 'Chaser' | 'Evader'
  baseMovement: 1 | 2
  mapId: string
  opponentType: 'human' | 'ai'
  aiStrategy: SimulationAgent
  transport: Transport
  winCondition: WinCondition
  objectivesTarget: number
  objectivesVisible: boolean
  movementMode: MovementMode
  startingMovementPoints: number
  maxSpendPerTurn: number
}

const DEFAULT_FORM: LobbyFormState = {
  maxTurns: 15,
  hostRole: 'Chaser',
  baseMovement: 2,
  mapId: mapRegistry.getAllMaps()[0].id,
  opponentType: 'human',
  aiStrategy: 'greedy',
  transport: 'async',
  winCondition: 'survive_turns',
  objectivesTarget: 5,
  objectivesVisible: true,
  movementMode: 'fixed',
  startingMovementPoints: 10,
  maxSpendPerTurn: 0,
}

const TRANSPORT_LABELS: Record<Transport, string> = {
  async: 'Async (Supabase)',
  live: 'Live (P2P)',
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
    transport: form.transport,
    winCondition: form.winCondition,
    objectivesTarget: form.objectivesTarget,
    objectivesVisible: form.objectivesVisible,
    movementMode: form.movementMode,
    startingMovementPoints: form.startingMovementPoints,
    maxSpendPerTurn: form.maxSpendPerTurn,
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
            {form.winCondition === 'collect_objectives' ? 'Turn Limit (Failsafe)' : 'Turn Limit'}
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

        {/* Movement mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Movement Mode
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {([
              ['fixed', 'Fixed'],
              ['pool',  'Pool'],
            ] as [MovementMode, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setForm(f => ({ ...f, movementMode: value }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  form.movementMode === value
                    ? 'bg-teal-700 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {form.movementMode === 'fixed' && (
            <>
              <div className="flex rounded-lg overflow-hidden border border-neutral-700 mt-1">
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
            </>
          )}

          {form.movementMode === 'pool' && (
            <div className="flex flex-col gap-2 mt-1 p-3 bg-neutral-800 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Starting Movement Points
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

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Max Spend Per Turn
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={form.maxSpendPerTurn}
                    onChange={e => setForm(f => ({ ...f, maxSpendPerTurn: Number(e.target.value) }))}
                    className="flex-1 accent-teal-500"
                  />
                  <span className="text-sm font-mono text-neutral-200 w-14 text-right">
                    {form.maxSpendPerTurn === 0 ? 'Unlimited' : form.maxSpendPerTurn}
                  </span>
                </div>
              </div>

              <p className="text-xs text-neutral-500 leading-relaxed">
                Both players share a match-long movement pool. Spend as much or as little
                as you want each turn — a correct prediction adds +1 to your total.
              </p>
            </div>
          )}
        </div>

        {/* Win condition */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Evader Goal
          </label>
          <div className="flex rounded-lg overflow-hidden border border-neutral-700">
            {([
              ['survive_turns',      'Survive Turns'],
              ['collect_objectives', 'Collect Objectives'],
            ] as [WinCondition, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setForm(f => ({ ...f, winCondition: value }))}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                  form.winCondition === value
                    ? 'bg-amber-700 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {form.winCondition === 'collect_objectives' && (
            <div className="flex flex-col gap-2 mt-1 p-3 bg-neutral-800 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Objectives to Collect
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={form.objectivesTarget}
                    onChange={e => setForm(f => ({ ...f, objectivesTarget: Number(e.target.value) }))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="text-sm font-mono text-neutral-200 w-4 text-right">
                    {form.objectivesTarget}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Objectives Visible to Chaser
                </label>
                <div className="flex rounded-lg overflow-hidden border border-neutral-600">
                  {([
                    [true,  'Visible'],
                    [false, 'Hidden'],
                  ] as [boolean, string][]).map(([value, label]) => (
                    <button
                      key={String(value)}
                      onClick={() => setForm(f => ({ ...f, objectivesVisible: value }))}
                      className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                        form.objectivesVisible === value
                          ? 'bg-neutral-600 text-white'
                          : 'bg-neutral-900 text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {form.objectivesVisible
                    ? 'Chaser can see objective locations.'
                    : 'Chaser only sees when an objective is collected.'}
                </p>
              </div>
            </div>
          )}

          {form.winCondition === 'survive_turns' && (
            <p className="text-xs text-neutral-500 leading-relaxed">
              Evader wins by reaching the turn limit without being tagged.
            </p>
          )}
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

        {/* Transport (human opponent only) */}
        {form.opponentType === 'human' && (
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
        )}

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
