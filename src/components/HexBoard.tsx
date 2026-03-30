import { motion } from 'motion/react'
import type { HexCoord, WallCoord, GameSettings } from '../types'
import {
  hexToPixel, hexPolygonPoints, getAllHexes, HEX_RADIUS,
  squareToPixel, squarePolygonPoints, getAllSquares, SQUARE_RADIUS,
} from '../lib/hexGrid'
import { obstacleSet, buildWallSet, validNeighbors, reachableDestinations } from '../lib/hexGameLogic'
import type { PlanningPhase, DraftPlan } from './PlanningPanel'

const HEX_SIZE    = 38
const SQUARE_SIZE = 42
const PADDING     = 30

function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`
}

function cellToPixel(q: number, r: number, settings: GameSettings): { x: number; y: number } {
  return settings.gridType === 'square'
    ? squareToPixel(q, r, SQUARE_SIZE)
    : hexToPixel(q, r, HEX_SIZE)
}

function cellPolygonPoints(cx: number, cy: number, settings: GameSettings): string {
  return settings.gridType === 'square'
    ? squarePolygonPoints(cx, cy, SQUARE_SIZE - 2)
    : hexPolygonPoints(cx, cy, HEX_SIZE - 1.5)
}

function boardDimensions(settings: GameSettings): { width: number; height: number; offsetX: number; offsetY: number } {
  if (settings.gridType === 'square') {
    const side = (2 * SQUARE_RADIUS + 1) * SQUARE_SIZE + PADDING * 2
    return { width: side, height: side, offsetX: side / 2, offsetY: side / 2 }
  }
  const width  = (3 * HEX_RADIUS + 2) * HEX_SIZE + PADDING * 2
  const height = Math.sqrt(3) * HEX_SIZE * (2 * HEX_RADIUS + 1) + PADDING * 2
  return { width, height, offsetX: width / 2, offsetY: height / 2 }
}

function getAllCells(settings: GameSettings): HexCoord[] {
  return settings.gridType === 'square' ? getAllSquares() : getAllHexes()
}

/**
 * Returns the two pixel endpoints of the hex edge shared between adjacent cells (q1,r1)→(q2,r2).
 * Coordinates are relative to the board origin (before adding offsetX/offsetY).
 */
function hexWallEdgePoints(
  q1: number, r1: number, q2: number, r2: number,
  size: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dq = q2 - q1
  const dr = r2 - r1
  const s = size
  const h = (Math.sqrt(3) / 2) * s

  // Edge vertex offsets from the center of (q1,r1) for each hex direction
  const edgeOffsets: Record<string, [[number, number], [number, number]]> = {
    '0,-1':  [[-s / 2, -h], [s / 2, -h]],
    '1,-1':  [[s / 2, -h],  [s, 0]],
    '1,0':   [[s, 0],       [s / 2, h]],
    '0,1':   [[s / 2, h],   [-s / 2, h]],
    '-1,1':  [[-s / 2, h],  [-s, 0]],
    '-1,0':  [[-s, 0],      [-s / 2, -h]],
  }

  const offsets = edgeOffsets[`${dq},${dr}`]
  if (!offsets) return null

  const { x: ax, y: ay } = hexToPixel(q1, r1, size)
  return {
    x1: ax + offsets[0][0],
    y1: ay + offsets[0][1],
    x2: ax + offsets[1][0],
    y2: ay + offsets[1][1],
  }
}

function getValidTargets(
  phase: PlanningPhase,
  draft: DraftPlan,
  myPos: HexCoord,
  opponentPos: HexCoord,
  obstacles: HexCoord[],
  walls: Set<string>,
  settings: GameSettings,
): Set<string> {
  const blocked = obstacleSet(obstacles)
  const { gridType } = settings

  switch (phase) {
    case 'move_step1': {
      if (settings.predictionTarget === 'destination') {
        return new Set(reachableDestinations(myPos, blocked, gridType, settings.moveSteps, walls).map(hexKey))
      }
      return new Set(validNeighbors(myPos, blocked, gridType, walls).map(hexKey))
    }
    case 'move_step2': {
      if (!draft.moveStep1) return new Set()
      return new Set(validNeighbors(draft.moveStep1, blocked, gridType, walls).map(hexKey))
    }
    case 'predict_step1': {
      if (settings.predictionTarget === 'destination') {
        return new Set(reachableDestinations(opponentPos, blocked, gridType, settings.moveSteps, walls).map(hexKey))
      }
      return new Set(validNeighbors(opponentPos, blocked, gridType, walls).map(hexKey))
    }
    case 'predict_step2': {
      if (!draft.predictStep1) return new Set()
      return new Set(validNeighbors(draft.predictStep1, blocked, gridType, walls).map(hexKey))
    }
    case 'bonus_move': {
      const finalPlanPos = draft.moveStep2 ?? draft.moveStep1
      if (!finalPlanPos) return new Set()
      return new Set(validNeighbors(finalPlanPos, blocked, gridType, walls).map(hexKey))
    }
    case 'ready':
      return new Set()
  }
}

function pathPoints(
  a: HexCoord,
  b: HexCoord,
  settings: GameSettings,
  offsetX: number,
  offsetY: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const pa = cellToPixel(a.q, a.r, settings)
  const pb = cellToPixel(b.q, b.r, settings)
  return {
    x1: pa.x + offsetX,
    y1: pa.y + offsetY,
    x2: pb.x + offsetX,
    y2: pb.y + offsetY,
  }
}

interface Props {
  myPos: HexCoord
  opponentPos: HexCoord
  prevMyPath: HexCoord[] | null
  prevOpponentPath: HexCoord[] | null
  isChaser: boolean
  obstacles: HexCoord[]
  walls: WallCoord[]
  collectibleTokens: HexCoord[]
  planningPhase: PlanningPhase
  draft: DraftPlan
  waitingForPartner: boolean
  winner: 'chaser' | 'evader' | null
  settings: GameSettings
  showCoords: boolean
  onHexClick: (hex: HexCoord) => void
}

export function HexBoard({
  myPos,
  opponentPos,
  prevMyPath,
  prevOpponentPath,
  isChaser,
  obstacles,
  walls,
  collectibleTokens,
  planningPhase,
  draft,
  waitingForPartner,
  winner,
  settings,
  showCoords,
  onHexClick,
}: Props) {
  const { width: svgWidth, height: svgHeight, offsetX, offsetY } = boardDimensions(settings)
  const allCells = getAllCells(settings)

  const obstacleKeys = obstacleSet(obstacles)
  const wallKeys = buildWallSet(walls)
  const validTargets = (!waitingForPartner && !winner)
    ? getValidTargets(planningPhase, draft, myPos, opponentPos, obstacles, wallKeys, settings)
    : new Set<string>()

  const movePathKeys  = new Set([draft.moveStep1, draft.moveStep2].filter(Boolean).map(h => hexKey(h!)))
  const predPathKeys  = new Set([draft.predictStep1, draft.predictStep2].filter(Boolean).map(h => hexKey(h!)))
  const bonusPathKeys = new Set(draft.bonusMove ? [hexKey(draft.bonusMove)] : [])

  const myColor       = isChaser ? '#ef4444' : '#3b82f6'
  const opponentColor = isChaser ? '#3b82f6' : '#ef4444'
  const bonusColor    = '#22c55e'

  function pp(a: HexCoord, b: HexCoord) {
    return pathPoints(a, b, settings, offsetX, offsetY)
  }

  const tokenSize = settings.gridType === 'square' ? SQUARE_SIZE * 0.7 : HEX_SIZE * 1.0

  return (
    <div className="relative select-none" style={{ width: svgWidth, height: svgHeight }}>
      <svg width={svgWidth} height={svgHeight} className="absolute inset-0">
        <defs>
          <marker id="arrow-move" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={myColor} />
          </marker>
          <marker id="arrow-pred" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="#a855f7" fillOpacity="0.7" />
          </marker>
          <marker id="arrow-bonus" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={bonusColor} />
          </marker>
          <marker id="arrow-last-my" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={myColor} fillOpacity="0.5" />
          </marker>
          <marker id="arrow-last-opp" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={opponentColor} fillOpacity="0.5" />
          </marker>
        </defs>

        {/* Cells */}
        {allCells.map(({ q, r }) => {
          const { x, y } = cellToPixel(q, r, settings)
          const cx = x + offsetX
          const cy = y + offsetY
          const key = `${q},${r}`
          const isObstacle = obstacleKeys.has(key)
          const isValid    = validTargets.has(key)
          const isMovePath = movePathKeys.has(key)
          const isPredPath = predPathKeys.has(key)
          const isBonusPath = bonusPathKeys.has(key)

          let fill = '#1a1a1a'
          if (isObstacle)        fill = '#2d1f1f'
          else if (isValid)      fill = '#1e293b'

          let stroke = '#2a2a2a'
          let strokeWidth = 0.8
          if (isObstacle)        { stroke = '#5a3030'; strokeWidth = 1 }
          else if (isMovePath)   { stroke = myColor;   strokeWidth = 2 }
          else if (isBonusPath)  { stroke = bonusColor; strokeWidth = 2 }
          else if (isPredPath)   { stroke = '#a855f7'; strokeWidth = 2 }
          else if (isValid)      { stroke = '#60a5fa'; strokeWidth = 1.5 }

          return (
            <g key={key} style={{ cursor: isValid ? 'pointer' : 'default' }} onClick={() => isValid && onHexClick({ q, r })}>
              <polygon
                points={cellPolygonPoints(cx, cy, settings)}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeOpacity={isValid ? 0.9 : 1}
              />
              {showCoords && (
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={settings.gridType === 'square' ? 11 : 10}
                  fontWeight="600"
                  fill={isObstacle ? '#a87070' : '#a0a0a0'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {q},{r}
                </text>
              )}
            </g>
          )
        })}

        {/* Walls */}
        {walls.map(({ q1, r1, q2, r2 }) => {
          const pts = hexWallEdgePoints(q1, r1, q2, r2, HEX_SIZE)
          if (!pts) return null
          return (
            <line
              key={`wall-${q1},${r1}>${q2},${r2}`}
              x1={pts.x1 + offsetX} y1={pts.y1 + offsetY}
              x2={pts.x2 + offsetX} y2={pts.y2 + offsetY}
              stroke="#c0392b"
              strokeWidth={3}
              strokeLinecap="round"
            />
          )
        })}

        {/* Collectible tokens */}
        {collectibleTokens.map(({ q, r }) => {
          const { x, y } = cellToPixel(q, r, settings)
          const cx = x + offsetX
          const cy = y + offsetY
          const s = settings.gridType === 'square' ? SQUARE_SIZE * 0.22 : HEX_SIZE * 0.26
          return (
            <polygon
              key={`token-${q},${r}`}
              points={[
                [cx,     cy - s * 1.4],
                [cx + s, cy          ],
                [cx,     cy + s * 1.4],
                [cx - s, cy          ],
              ].map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ')}
              fill="#f59e0b"
              stroke="#fbbf24"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
          )
        })}

        {/* Move path arrows */}
        {draft.moveStep1 && (() => {
          const { x1, y1, x2, y2 } = pp(myPos, draft.moveStep1)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={2.5} strokeOpacity={0.7}
            markerEnd="url(#arrow-move)" />
        })()}
        {draft.moveStep1 && draft.moveStep2 && (() => {
          const { x1, y1, x2, y2 } = pp(draft.moveStep1!, draft.moveStep2)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={2.5} strokeOpacity={0.7}
            markerEnd="url(#arrow-move)" />
        })()}

        {/* Prediction path arrows (purple dashed) */}
        {draft.predictStep1 && (() => {
          const { x1, y1, x2, y2 } = pp(opponentPos, draft.predictStep1)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#a855f7" strokeWidth={2} strokeOpacity={0.6}
            strokeDasharray="5 3" markerEnd="url(#arrow-pred)" />
        })()}
        {draft.predictStep1 && draft.predictStep2 && (() => {
          const { x1, y1, x2, y2 } = pp(draft.predictStep1!, draft.predictStep2)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#a855f7" strokeWidth={2} strokeOpacity={0.6}
            strokeDasharray="5 3" markerEnd="url(#arrow-pred)" />
        })()}

        {/* Bonus move arrow (green dashed, from planned final pos) */}
        {draft.bonusMove && (() => {
          const fromPos = draft.moveStep2 ?? draft.moveStep1
          if (!fromPos) return null
          const { x1, y1, x2, y2 } = pp(fromPos, draft.bonusMove)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={bonusColor} strokeWidth={2} strokeOpacity={0.7}
            strokeDasharray="5 3" markerEnd="url(#arrow-bonus)" />
        })()}

        {/* Last-round movement arrows */}
        {prevMyPath && prevMyPath.slice(0, -1).map((from, i) => {
          const to = prevMyPath[i + 1]
          const { x1, y1, x2, y2 } = pp(from, to)
          const isLast = i === prevMyPath.length - 2
          return (
            <line key={`my-step-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={myColor} strokeWidth={2} strokeOpacity={0.35}
              markerEnd={isLast ? 'url(#arrow-last-my)' : undefined} />
          )
        })}
        {prevOpponentPath && prevOpponentPath.slice(0, -1).map((from, i) => {
          const to = prevOpponentPath[i + 1]
          const { x1, y1, x2, y2 } = pp(from, to)
          const isLast = i === prevOpponentPath.length - 2
          return (
            <line key={`opp-step-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={opponentColor} strokeWidth={2} strokeOpacity={0.35}
              markerEnd={isLast ? 'url(#arrow-last-opp)' : undefined} />
          )
        })}
      </svg>

      {/* Opponent token */}
      {(() => {
        const { x, y } = cellToPixel(opponentPos.q, opponentPos.r, settings)
        return (
          <motion.div
            key="opponent"
            initial={false}
            animate={{ x: x + offsetX - tokenSize / 2, y: y + offsetY - tokenSize / 2 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            style={{
              position: 'absolute',
              width: tokenSize,
              height: tokenSize,
              borderRadius: '50%',
              backgroundColor: opponentColor,
              opacity: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 800,
              color: 'white',
              zIndex: 9,
              pointerEvents: 'none',
            }}
          >
            {isChaser ? 'E' : 'C'}
          </motion.div>
        )
      })()}

      {/* My token */}
      {(() => {
        const { x, y } = cellToPixel(myPos.q, myPos.r, settings)
        const myTokenSize = tokenSize * 1.1
        return (
          <motion.div
            key="mine"
            initial={false}
            animate={{ x: x + offsetX - myTokenSize / 2, y: y + offsetY - myTokenSize / 2 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            style={{
              position: 'absolute',
              width: myTokenSize,
              height: myTokenSize,
              borderRadius: '50%',
              backgroundColor: myColor,
              boxShadow: `0 0 12px ${myColor}80`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              color: 'white',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            {isChaser ? 'C' : 'E'}
          </motion.div>
        )
      })()}

      {/* Win overlay */}
      {winner && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        >
          <div className={`text-2xl font-bold px-6 py-3 rounded-xl ${
            winner === 'chaser'
              ? 'text-red-300 bg-red-900/60'
              : 'text-blue-300 bg-blue-900/60'
          }`}>
            {winner === 'chaser' ? 'Tagged!' : 'Evader survives!'}
          </div>
        </div>
      )}
    </div>
  )
}
