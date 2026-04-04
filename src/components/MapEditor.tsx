import React, { useState, useCallback, useMemo } from 'react'
import { HexBoard } from './HexBoard'
import type { HexCoord, WallCoord, MapDefinition } from '../types'
import { HEX_RADIUS } from '../lib/hexGrid'
import { buildWallSet } from '../lib/hexGameLogic'

type EditorMode = 'obstacle' | 'wall' | 'chaser' | 'evader'

const DEFAULT_MAP_NAME = 'Custom Arena'

function hexKey(q: number, r: number) {
  return `${q},${r}`
}

function normalizeWall(q1: number, r1: number, q2: number, r2: number): WallCoord {
  return q1 < q2 || (q1 === q2 && r1 < r2) ? { q1, r1, q2, r2 } : { q1: q2, r1: r2, q2: q1, r2: r1 }
}

function getLocalEdge(hexX: number, hexY: number, size: number): { dq: number, dr: number } | null {
  // Determine which edge of the hex the click is closest to.
  // This is a rough estimation based on angles from the center of the hex.
  const angle = Math.atan2(hexY, hexX)
  const deg = angle * (180 / Math.PI)

  // Hex directions based on standard pointy-topped orientation
  // But wait, our hexes are flat-topped!
  // Flat topped edge angles from center: 0, 60, 120, 180, -120, -60
  // Actually, flat-topped points are at 0, 60, etc., so edges are at 30, 90, 150, -150, -90, -30

  if (deg >= -60 && deg < 0) return { dq: 1, dr: -1 } // top right
  if (deg >= 0 && deg < 60) return { dq: 1, dr: 0 } // bottom right
  if (deg >= 60 && deg < 120) return { dq: 0, dr: 1 } // bottom
  if (deg >= 120 && deg < 180) return { dq: -1, dr: 1 } // bottom left
  if (deg >= -180 && deg < -120) return { dq: -1, dr: 0 } // top left
  if (deg >= -120 && deg < -60) return { dq: 0, dr: -1 } // top

  return null
}

export function MapEditor() {
  const [mapName, setMapName] = useState(DEFAULT_MAP_NAME)
  const [mode, setMode] = useState<EditorMode>('obstacle')
  const [isOrthographic, setIsOrthographic] = useState(true)
  const [showCoords, setShowCoords] = useState(true)

  const [chaserStart, setChaserStart] = useState<HexCoord>({ q: -3, r: 0 })
  const [evaderStart, setEvaderStart] = useState<HexCoord>({ q: 3, r: 0 })
  const [obstacles, setObstacles] = useState<Set<string>>(new Set())
  const [walls, setWalls] = useState<Set<string>>(new Set())

  const validTargets = useMemo(() => {
    // In editor, all valid board hexes are clickable
    const set = new Set<string>()
    for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
      for (let r = -HEX_RADIUS; r <= HEX_RADIUS; r++) {
        if (Math.abs(q + r) <= HEX_RADIUS) {
          set.add(`${q},${r}`)
        }
      }
    }
    return set
  }, [])

  const handleHexClickWithEvent = useCallback((hex: HexCoord, e?: unknown) => {
    const key = hexKey(hex.q, hex.r)

    if (mode === 'chaser') {
      if (!obstacles.has(key) && key !== hexKey(evaderStart.q, evaderStart.r)) {
        setChaserStart(hex)
      }
      return
    }

    if (mode === 'evader') {
      if (!obstacles.has(key) && key !== hexKey(chaserStart.q, chaserStart.r)) {
        setEvaderStart(hex)
      }
      return
    }

    if (mode === 'obstacle') {
      if (key === hexKey(chaserStart.q, chaserStart.r) || key === hexKey(evaderStart.q, evaderStart.r)) {
        return // Cannot place obstacle on start points
      }

      setObstacles(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }
  }, [mode, chaserStart, evaderStart, obstacles])

  // Custom click handler wrapper to intercept click events for wall edge detection
  const wrapperClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (mode !== 'wall') return

    // Fallback: we calculate the global click to determine which wall was clicked
    // We get the SVG bounds
    const svg = (e.target as HTMLElement).closest('svg')
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // We could calculate which edge was clicked based on local coordinates
    // For now we will rely on HexBoard emitting the correct click event natively
    // or passing the click event to handleHexClickWithEvent.
  }

  const exportMap = () => {
    const wallArr: WallCoord[] = Array.from(walls).map((w: string) => {
      const parts = w.split(/[\|,]/).map(Number)
      return { q1: parts[0], r1: parts[1], q2: parts[2], r2: parts[3] }
    })

    const obsArr: HexCoord[] = Array.from(obstacles).map((o: string) => {
      const parts = o.split(',').map(Number)
      return { q: parts[0], r: parts[1] }
    })

    const def: MapDefinition = {
      id: mapName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: mapName,
      chaserStart,
      evaderStart,
      obstacles: obsArr,
      walls: wallArr
    }

    const json = JSON.stringify(def, null, 2)
    navigator.clipboard.writeText(json)
    alert(`Map JSON copied to clipboard!\n\nSave it to src/maps/${def.id}.json and rebuild to add it to the game.`)
    console.log(json)
  }

  // To display correctly in HexBoard, we need to convert Set<string> back to arrays
  const obstacleArray = Array.from(obstacles).map((o: string) => {
    const parts = o.split(',').map(Number)
    return { q: parts[0], r: parts[1] }
  })

  const wallArray = Array.from(walls).map((w: string) => {
    const parts = w.split(/[\|,]/).map(Number)
    return { q1: parts[0], r1: parts[1], q2: parts[2], r2: parts[3] }
  })

  return (
    <div className="min-h-screen bg-neutral-900 flex text-white font-sans">
      {/* Sidebar Tool panel */}
      <div className="w-64 bg-neutral-800 p-6 flex flex-col gap-6 border-r border-neutral-700">
        <div>
          <h2 className="text-xl font-bold mb-4">Map Editor</h2>
          <button
            onClick={() => { window.location.href = '/' }}
            className="text-sm text-neutral-400 hover:text-white"
          >
            ← Back to Lobby
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-400 uppercase">Map Name</label>
          <input
            type="text"
            value={mapName}
            onChange={e => setMapName(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-400 uppercase">Tools</label>
          {(['obstacle', 'wall', 'chaser', 'evader'] as EditorMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-2 px-4 rounded text-sm font-medium text-left capitalize transition-colors ${
                mode === m ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
              }`}
            >
              {m === 'chaser' ? 'Set Chaser Start' : m === 'evader' ? 'Set Evader Start' : `Toggle ${m}s`}
            </button>
          ))}
          {mode === 'wall' && (
            <p className="text-xs text-neutral-400 mt-1 italic">
              Note: Wall placing requires HexBoard update to handle click edges.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <label className="text-xs font-semibold text-neutral-400 uppercase">View</label>
          <button
            onClick={() => setIsOrthographic(v => !v)}
            className="py-2 px-4 rounded text-sm font-medium bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
          >
            {isOrthographic ? 'Switch to Isometric' : 'Switch to Orthographic'}
          </button>
          <button
            onClick={() => setShowCoords(v => !v)}
            className={`py-2 px-4 rounded text-sm font-medium transition-colors ${
              showCoords ? 'bg-blue-700 text-white hover:bg-blue-600' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            {showCoords ? 'Hide Coordinates' : 'Show Coordinates'}
          </button>
        </div>

        <div className="mt-auto">
          <button
            onClick={exportMap}
            className="w-full py-3 bg-green-600 hover:bg-green-500 rounded font-bold text-white transition-colors"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Main Map View */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden" onClick={wrapperClick}>
        <HexBoard
          myPos={chaserStart}
          opponentPos={evaderStart}
          prevMyPath={null}
          prevOpponentPath={null}
          committedMyPath={null}
          committedOpponentPath={null}
          isChaser={true}
          elevations={Object.fromEntries(obstacleArray.map(o => [`${o.q},${o.r}`, 1]))}
          walls={wallArray}
          currentStep="ready"
          draft={{ moveDest: null, movePath: null, predictDest: null }}
          waitingForPartner={false}
          winner={null}
          showCoords={showCoords}
          validTargets={validTargets}
          onHexClick={(hex) => handleHexClickWithEvent(hex)}
          isOrthographic={isOrthographic}
          suppressValidHighlight={true}
          editorMode={mode === 'wall'}
          onWallToggle={(w) => {
            setWalls(prev => {
              const next = new Set(prev)
              const norm = normalizeWall(w.q1, w.r1, w.q2, w.r2)
              const key = `${norm.q1},${norm.r1}|${norm.q2},${norm.r2}`
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }}
        />
      </div>
    </div>
  )
}
