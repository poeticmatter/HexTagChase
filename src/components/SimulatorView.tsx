import { useState, useRef, useEffect, useMemo } from 'react'
import { MapThumbnail } from './MapThumbnail'
import { HexBoard } from './HexBoard'
import { mapRegistry } from '../lib/mapRegistry'
import type { SimulationConfig, SimulationResult } from '../lib/simulationTypes'
import { SimulationAgent } from '../lib/simulationAgent'
import Worker from '../workers/simulationWorker?worker'

type SimState = 'idle' | 'running' | 'complete' | 'error'
type HeatmapMode = 'chaser_freq' | 'evader_freq' | 'chaser_win_corr' | 'evader_win_corr'

export function SimulatorView() {
  const [status, setStatus] = useState<SimState>('idle')
  const [config, setConfig] = useState<SimulationConfig>({
    mapId: mapRegistry.getAllMaps()[0]?.id || '',
    iterations: 1000,
    baseMovement: 2,
    maxTurns: 30,
    chaserStrategy: 'random',
    evaderStrategy: 'greedy',
  })

  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('chaser_freq')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const startTimeRef = useRef<number>(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (status === 'running') {
      interval = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current)
      }, 100)
    }
    return () => clearInterval(interval)
  }, [status])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  function handleStart() {
    if (!config.mapId) return
    setStatus('running')
    setProgress({ completed: 0, total: config.iterations })
    setResult(null)
    setErrorMsg(null)
    setElapsed(0)
    startTimeRef.current = Date.now()

    workerRef.current = new Worker()
    workerRef.current.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress({ completed: msg.completed, total: msg.total })
      } else if (msg.type === 'result') {
        setResult(msg.data)
        setStatus('complete')
        workerRef.current?.terminate()
        workerRef.current = null
      }
    }
    workerRef.current.onerror = (err) => {
      console.error('Worker error', err)
      setErrorMsg('Simulation failed.')
      setStatus('error')
      workerRef.current?.terminate()
      workerRef.current = null
    }

    workerRef.current.postMessage(config)
  }

  function handleCancel() {
    workerRef.current?.terminate()
    workerRef.current = null
    setStatus('idle')
  }

  const mapDef = mapRegistry.getMapById(config.mapId)

  const heatmapData = useMemo(() => {
    if (!result || !mapDef) return undefined

    const data = new Map<string, { intensity: number; label?: string }>()

    let maxVal = 0

    // First pass to find max for normalization
    for (const [hexKey, stats] of Object.entries(result.hexStats) as [string, import('../lib/simulationTypes').HexSimStats][]) {
      let val = 0
      switch (heatmapMode) {
        case 'chaser_freq': val = stats.chaserLandings; break
        case 'evader_freq': val = stats.evaderLandings; break
        case 'chaser_win_corr':
          val = stats.chaserLandings > 0 ? stats.chaserLandingsOnChaserWin / stats.chaserLandings : 0
          break
        case 'evader_win_corr':
          val = stats.evaderLandings > 0 ? stats.evaderLandingsOnEvaderWin / stats.evaderLandings : 0
          break
      }
      if (val > maxVal) maxVal = val
    }

    if (maxVal === 0) return data

    for (const [hexKey, stats] of Object.entries(result.hexStats) as [string, import('../lib/simulationTypes').HexSimStats][]) {
      let val = 0
      let label = ''
      switch (heatmapMode) {
        case 'chaser_freq':
          val = stats.chaserLandings
          label = val > 0 ? String(val) : ''
          break
        case 'evader_freq':
          val = stats.evaderLandings
          label = val > 0 ? String(val) : ''
          break
        case 'chaser_win_corr':
          val = stats.chaserLandings > 0 ? stats.chaserLandingsOnChaserWin / stats.chaserLandings : 0
          label = stats.chaserLandings > 0 ? `${(val * 100).toFixed(0)}%` : ''
          break
        case 'evader_win_corr':
          val = stats.evaderLandings > 0 ? stats.evaderLandingsOnEvaderWin / stats.evaderLandings : 0
          label = stats.evaderLandings > 0 ? `${(val * 100).toFixed(0)}%` : ''
          break
      }

      // Scale by maxVal for intensity
      if (val > 0) {
        data.set(hexKey, {
          intensity: heatmapMode.includes('corr') ? val : val / maxVal, // Correlation is already 0-1
          label
        })
      }
    }

    return data
  }, [result, mapDef, heatmapMode])

  const heatmapColor = heatmapMode.startsWith('chaser') ? '#ef4444' : '#3b82f6'

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col gap-6">
      <div className="flex items-center gap-4 border-b border-slate-700 pb-4">
        <a href="/" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded font-medium text-sm transition-colors">
          &larr; Lobby
        </a>
        <h1 className="text-2xl font-bold">Monte Carlo Simulator</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Controls Sidebar */}
        <div className="bg-slate-800 p-6 rounded-lg flex flex-col gap-6 h-fit border border-slate-700">
          <h2 className="text-xl font-semibold mb-2">Configuration</h2>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-400">Map</label>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
              {mapRegistry.getAllMaps().map(map => (
                <button
                  key={map.id}
                  onClick={() => status === 'idle' && setConfig(c => ({ ...c, mapId: map.id }))}
                  disabled={status === 'running'}
                  className={`p-2 rounded border-2 transition-all text-left flex flex-col gap-2 ${
                    config.mapId === map.id
                      ? 'border-blue-500 bg-slate-700'
                      : 'border-slate-700 hover:border-slate-500'
                  } ${status === 'running' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <MapThumbnail mapDef={map} selected={false} onClick={() => {}} />
                  <span className="text-xs font-medium truncate w-full block">{map.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-400">Iterations</label>
              <select
                value={config.iterations}
                onChange={e => setConfig(c => ({ ...c, iterations: Number(e.target.value) }))}
                disabled={status === 'running'}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              >
                <option value={100}>100</option>
                <option value={500}>500</option>
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-400">Base Movement</label>
              <select
                value={config.baseMovement}
                onChange={e => setConfig(c => ({ ...c, baseMovement: Number(e.target.value) as 1 | 2 }))}
                disabled={status === 'running'}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              >
                <option value={1}>1 Hex</option>
                <option value={2}>2 Hexes</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-400">Max Turns</label>
              <input
                type="number"
                min={5} max={100}
                value={config.maxTurns}
                onChange={e => setConfig(c => ({ ...c, maxTurns: Number(e.target.value) }))}
                disabled={status === 'running'}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-red-400">Chaser AI</label>
              <select
                value={config.chaserStrategy}
                onChange={e => setConfig(c => ({ ...c, chaserStrategy: e.target.value as SimulationAgent }))}
                disabled={status === 'running'}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              >
                <option value="random">Random</option>
                <option value="greedy">Greedy</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-blue-400">Evader AI</label>
              <select
                value={config.evaderStrategy}
                onChange={e => setConfig(c => ({ ...c, evaderStrategy: e.target.value as SimulationAgent }))}
                disabled={status === 'running'}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              >
                <option value="random">Random</option>
                <option value="greedy">Greedy</option>
              </select>
            </div>
          </div>

          {status === 'idle' || status === 'complete' || status === 'error' ? (
            <button
              onClick={handleStart}
              className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded transition-colors"
            >
              Run Simulation
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="mt-4 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded transition-colors"
            >
              Cancel ({progress ? Math.round((progress.completed / progress.total) * 100) : 0}%)
            </button>
          )}

          {status === 'running' && progress && (
            <div className="text-center text-sm text-slate-400">
              {(elapsed / 1000).toFixed(1)}s elapsed
            </div>
          )}

          {errorMsg && (
            <div className="text-red-400 text-sm font-medium mt-2">{errorMsg}</div>
          )}
        </div>

        {/* Results Area */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {result && mapDef && status === 'complete' ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center">
                  <span className="text-sm text-slate-400 mb-1">Chaser Win Rate</span>
                  <span className="text-3xl font-bold text-red-400">
                    {((result.chaserWins / result.totalGames) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center">
                  <span className="text-sm text-slate-400 mb-1">Evader Win Rate</span>
                  <span className="text-3xl font-bold text-blue-400">
                    {((result.evaderWins / result.totalGames) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center">
                  <span className="text-sm text-slate-400 mb-1">Avg Game Length</span>
                  <span className="text-3xl font-bold text-slate-200">
                    {result.avgGameLength.toFixed(1)} <span className="text-lg">turns</span>
                  </span>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center">
                  <span className="text-sm text-slate-400 mb-1">Pred Accuracy (C / E)</span>
                  <span className="text-2xl font-bold text-slate-200">
                    <span className="text-red-400">{(result.chaserPredictionAccuracy * 100).toFixed(0)}%</span>
                    {' / '}
                    <span className="text-blue-400">{(result.evaderPredictionAccuracy * 100).toFixed(0)}%</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Heatmap View */}
                <div className="lg:col-span-2 bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col relative min-h-[600px]">
                  <div className="flex gap-2 mb-4 justify-center absolute top-4 left-0 right-0 z-10">
                    <button onClick={() => setHeatmapMode('chaser_freq')} className={`px-3 py-1 rounded text-sm font-medium ${heatmapMode === 'chaser_freq' ? 'bg-red-600' : 'bg-slate-700'}`}>Chaser Freq</button>
                    <button onClick={() => setHeatmapMode('evader_freq')} className={`px-3 py-1 rounded text-sm font-medium ${heatmapMode === 'evader_freq' ? 'bg-blue-600' : 'bg-slate-700'}`}>Evader Freq</button>
                    <button onClick={() => setHeatmapMode('chaser_win_corr')} className={`px-3 py-1 rounded text-sm font-medium ${heatmapMode === 'chaser_win_corr' ? 'bg-red-900 border border-red-500' : 'bg-slate-700'}`}>Chaser Win Corr</button>
                    <button onClick={() => setHeatmapMode('evader_win_corr')} className={`px-3 py-1 rounded text-sm font-medium ${heatmapMode === 'evader_win_corr' ? 'bg-blue-900 border border-blue-500' : 'bg-slate-700'}`}>Evader Win Corr</button>
                  </div>

                  <div className="flex-1 flex items-center justify-center overflow-hidden pt-12">
                    <div style={{ transform: 'scale(0.8)', transformOrigin: 'center center' }}>
                      <HexBoard
                        myPos={{ q: 0, r: 0 }}
                        opponentPos={{ q: 0, r: 0 }}
                        prevMyPath={null}
                        prevOpponentPath={null}
                        committedMyPath={null}
                        committedOpponentPath={null}
                        isChaser={true}
                        elevations={mapDef.elevations || {}}
                        walls={mapDef.walls}
                        currentStep="ready"
                        draft={{ moveDest: null, movePath: null, predictDest: null }}
                        waitingForPartner={true}
                        winner={null}
                        showCoords={true}
                        validTargets={new Set()}
                        onHexClick={() => {}}
                        heatmapData={heatmapData}
                        heatmapColor={heatmapColor}
                      />
                    </div>
                  </div>
                </div>

                {/* Length Distribution Chart */}
                <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col gap-4">
                  <h3 className="text-lg font-bold">Game Length Distribution</h3>

                  <div className="flex-1 w-full pt-4 min-h-[300px] relative">
                    {(() => {
                      const dist = result.gameLengthDistribution
                      const maxCount = Math.max(...dist, 1) // prevent div by zero
                      // Find first and last non-zero to trim the chart if maxTurns is huge
                      let startIdx = 1
                      let endIdx = dist.length - 1
                      while (startIdx < endIdx && dist[startIdx] === 0) startIdx++
                      while (endIdx > startIdx && dist[endIdx] === 0) endIdx--

                      // Add a bit of padding
                      startIdx = Math.max(1, startIdx - 1)
                      endIdx = Math.min(dist.length - 1, endIdx + 1)

                      const visibleBars = []
                      for (let i = startIdx; i <= endIdx; i++) {
                        visibleBars.push({ turn: i, count: dist[i] })
                      }

                      const numBars = visibleBars.length
                      const viewBoxWidth = 1000
                      const viewBoxHeight = 300
                      const padding = 10
                      const gap = 2

                      const barWidth = Math.max(1, (viewBoxWidth - (numBars - 1) * gap) / numBars)

                      return (
                        <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight + 20}`} className="w-full h-full overflow-visible">
                          {visibleBars.map((bar, index) => {
                            const x = index * (barWidth + gap)
                            // Leave room for text below (20px)
                            const usableHeight = viewBoxHeight - padding
                            const barHeight = bar.count > 0 ? Math.max(4, (bar.count / maxCount) * usableHeight) : 0
                            const y = usableHeight - barHeight + padding

                            return (
                              <g key={`bar-${bar.turn}`} className="group">
                                <rect
                                  x={x}
                                  y={y}
                                  width={barWidth}
                                  height={barHeight}
                                  className="fill-slate-500 group-hover:fill-slate-400 transition-colors"
                                  rx={2}
                                />
                                <text
                                  x={x + barWidth / 2}
                                  y={viewBoxHeight + 15}
                                  textAnchor="middle"
                                  fontSize="12"
                                  className="fill-slate-500"
                                >
                                  {bar.turn}
                                </text>
                                {bar.count > 0 && (
                                  <g className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <rect
                                      x={x + barWidth / 2 - 30}
                                      y={y - 25}
                                      width={60}
                                      height={20}
                                      className="fill-slate-900"
                                      rx={4}
                                    />
                                    <text
                                      x={x + barWidth / 2}
                                      y={y - 12}
                                      textAnchor="middle"
                                      fontSize="10"
                                      className="fill-white"
                                    >
                                      {bar.count}
                                    </text>
                                  </g>
                                )}
                              </g>
                            )
                          })}
                        </svg>
                      )
                    })()}
                  </div>

                  <div className="text-xs text-slate-400 text-center mt-2">
                    Completed in {(result.durationMs / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-500 h-full min-h-[600px]">
              {status === 'running' ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin"></div>
                  <div className="text-xl font-medium">Running Simulation...</div>
                  {progress && (
                    <div className="w-64 bg-slate-800 rounded-full h-2 mt-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                      ></div>
                    </div>
                  )}
                  <div className="text-sm font-medium mt-1">
                    {progress ? `${progress.completed} / ${progress.total}` : 'Initializing...'}
                  </div>
                </div>
              ) : (
                <div className="text-xl">Configure and run a simulation to see results</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
