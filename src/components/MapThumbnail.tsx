import type { MapDefinition } from '../types'
import { hexToPixel, HEX_RADIUS } from '../lib/hexGrid'

interface MapThumbnailProps {
  mapDef: MapDefinition
  selected: boolean
  onClick: () => void
}

const THUMBNAIL_HEX_SIZE = 12

// Pre-calculate dimensions for the thumbnail based on HEX_RADIUS
const worldExtentY = Math.sqrt(3) * THUMBNAIL_HEX_SIZE * (2 * HEX_RADIUS + 1)
const worldExtentX = (3 * HEX_RADIUS + 2) * THUMBNAIL_HEX_SIZE

const width = worldExtentX
const height = worldExtentY
const offsetX = width / 2
const offsetY = height / 2

function hexVertOffsets(size: number): [number, number][] {
  const h = (Math.sqrt(3) / 2) * size
  return [
    [+size,     0        ],  // 0 right
    [+size / 2, +h],  // 1 lower-right
    [-size / 2, +h],  // 2 lower-left
    [-size,     0        ],  // 3 left
    [-size / 2, -h],  // 4 upper-left
    [+size / 2, -h],  // 5 upper-right
  ]
}

function hexPolygon(q: number, r: number, size: number) {
  const { x, y } = hexToPixel(q, r, size)
  const cx = x + offsetX
  const cy = y + offsetY
  return hexVertOffsets(size)
    .map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`)
    .join(' ')
}

const HEX_H = (Math.sqrt(3) / 2) * THUMBNAIL_HEX_SIZE
const WALL_EDGE_OFFSETS: Record<string, [[number, number], [number, number]]> = {
  '1,-1':  [[THUMBNAIL_HEX_SIZE / 2,  -HEX_H], [THUMBNAIL_HEX_SIZE, 0]],
  '1,0':   [[THUMBNAIL_HEX_SIZE,      0      ], [THUMBNAIL_HEX_SIZE / 2, HEX_H]],
  '0,1':   [[THUMBNAIL_HEX_SIZE / 2,  HEX_H ], [-THUMBNAIL_HEX_SIZE / 2, HEX_H]],
}

export function MapThumbnail({ mapDef, selected, onClick }: MapThumbnailProps) {
  const obstacleSet = new Set(mapDef.obstacles.map(h => `${h.q},${h.r}`))

  // Generating grid cells. We can roughly estimate the grid by just generating all within radius
  const cells = []
  for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
    for (let r = -HEX_RADIUS; r <= HEX_RADIUS; r++) {
      if (Math.abs(q + r) <= HEX_RADIUS) {
        cells.push({ q, r })
      }
    }
  }

  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer rounded-lg border-2 overflow-hidden transition-colors ${
        selected ? 'border-blue-500 bg-neutral-800' : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
      }`}
      style={{ width: '160px' }}
    >
      <div className="flex justify-center p-2">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {cells.map(({ q, r }) => {
            const isObs = obstacleSet.has(`${q},${r}`)
            return (
              <polygon
                key={`${q},${r}`}
                points={hexPolygon(q, r, THUMBNAIL_HEX_SIZE)}
                fill={isObs ? '#5e4f3d' : '#877c6e'}
                stroke="#666"
                strokeWidth={0.5}
              />
            )
          })}

          {mapDef.walls.map(w => {
            const normKey = `${w.q2 - w.q1},${w.r2 - w.r1}`
            const offs = WALL_EDGE_OFFSETS[normKey]
            if (!offs) return null
            const { x: ax, y: ay } = hexToPixel(w.q1, w.r1, THUMBNAIL_HEX_SIZE)
            const cx = ax + offsetX
            const cy = ay + offsetY

            return (
              <line
                key={`w-${w.q1},${w.r1}-${w.q2},${w.r2}`}
                x1={cx + offs[0][0]}
                y1={cy + offs[0][1]}
                x2={cx + offs[1][0]}
                y2={cy + offs[1][1]}
                stroke="#ef4444"
                strokeWidth={3}
                strokeLinecap="round"
              />
            )
          })}

          {/* Spawn points */}
          {(() => {
            const cp = hexToPixel(mapDef.chaserStart.q, mapDef.chaserStart.r, THUMBNAIL_HEX_SIZE)
            return <circle cx={cp.x + offsetX} cy={cp.y + offsetY} r={4} fill="#ef4444" />
          })()}
          {(() => {
            const ep = hexToPixel(mapDef.evaderStart.q, mapDef.evaderStart.r, THUMBNAIL_HEX_SIZE)
            return <circle cx={ep.x + offsetX} cy={ep.y + offsetY} r={4} fill="#3b82f6" />
          })()}
        </svg>
      </div>
      <div className="text-center text-xs py-1 bg-black bg-opacity-40 font-semibold truncate px-2">
        {mapDef.name}
      </div>
    </div>
  )
}
