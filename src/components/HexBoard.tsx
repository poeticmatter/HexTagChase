import { motion } from 'motion/react'
import type { HexCoord, WallCoord, Role, PowerName, GameState } from '../types'
import {
  hexToPixel, hexPolygonPoints, getAllHexes, HEX_RADIUS,
} from '../lib/hexGrid'
import { obstacleSet, buildWallSet, validNeighbors, reachableDestinations } from '../lib/hexGameLogic'
import type { DraftPlan } from './PlanningPanel'
import type { UIStep, TurnSchema } from '../types'
import type { ReachableDestinationsCtx } from '../lib/powers/IAthletePower'
import { getPowerStrategy } from '../lib/powers/PowerFactory'

const HEX_SIZE = 38
const PADDING  = 30

function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`
}

function cellToPixel(q: number, r: number): { x: number; y: number } {
  return hexToPixel(q, r, HEX_SIZE)
}

function cellPolygonPoints(cx: number, cy: number): string {
  return hexPolygonPoints(cx, cy, HEX_SIZE - 1.5)
}

function boardDimensions(): { width: number; height: number; offsetX: number; offsetY: number } {
  const width  = (3 * HEX_RADIUS + 2) * HEX_SIZE + PADDING * 2
  const height = Math.sqrt(3) * HEX_SIZE * (2 * HEX_RADIUS + 1) + PADDING * 2
  return { width, height, offsetX: width / 2, offsetY: height / 2 }
}

function getAllCells(): HexCoord[] {
  return getAllHexes()
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
  currentStep: UIStep | 'ready',
  draft: DraftPlan,
  myPos: HexCoord,
  opponentPos: HexCoord,
  obstacles: HexCoord[],
  walls: Set<string>,
  gameState: GameState,
  myRole: Role,
  myPowerName: PowerName,
  oppPowerName: PowerName,
): Set<string> {
  const blocked = obstacleSet(obstacles)
  const oppRole: Role = myRole === 'chaser' ? 'evader' : 'chaser'

  switch (currentStep) {
    case 'select_declaration':
    case 'select_movement_1': {
      const strategy = getPowerStrategy(myPowerName)
      const baseDestinations = reachableDestinations(myPos, blocked, walls)
      const ctx: ReachableDestinationsCtx = { state: gameState, pos: myPos, role: myRole, blocked, walls }
      return new Set(strategy.onReachableDestinationsRequest(ctx, baseDestinations).map(hexKey))
    }
    case 'select_movement_2': {
      if (!draft.moveDest1) return new Set()
      // Line ability's second movement step: from moveDest1
      return new Set(validNeighbors(draft.moveDest1, blocked, walls).map(hexKey))
    }
    case 'select_prediction': {
      const strategy = getPowerStrategy(oppPowerName)
      const baseDestinations = reachableDestinations(opponentPos, blocked, walls)
      const ctx: ReachableDestinationsCtx = { state: gameState, pos: opponentPos, role: oppRole, blocked, walls }
      return new Set(strategy.onReachableDestinationsRequest(ctx, baseDestinations).map(hexKey))
    }
    case 'select_bonus': {
      // Bonus is always a standard 1-step move from the final destination; power hooks are not applied
      const finalDest = draft.moveDest2 || draft.moveDest1
      if (!finalDest) return new Set()
      return new Set(validNeighbors(finalDest, blocked, walls).map(hexKey))
    }
    case 'select_reaction':
    case 'idle_confirmation':
    case 'ready':
      return new Set()
  }
}

function pathPoints(
  a: HexCoord,
  b: HexCoord,
  offsetX: number,
  offsetY: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const pa = cellToPixel(a.q, a.r)
  const pb = cellToPixel(b.q, b.r)
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
  currentStep: UIStep | 'ready'
  draft: DraftPlan
  waitingForPartner: boolean
  winner: 'chaser' | 'evader' | null
  showCoords: boolean
  opponentUnmaskedDests: HexCoord[]
  gameState: GameState
  myPowerName: PowerName
  oppPowerName: PowerName
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
  currentStep,
  draft,
  waitingForPartner,
  winner,
  showCoords,
  opponentUnmaskedDests,
  gameState,
  myPowerName,
  oppPowerName,
  onHexClick,
}: Props) {
  const { width: svgWidth, height: svgHeight, offsetX, offsetY } = boardDimensions()
  const allCells = getAllCells()

  const obstacleKeys = obstacleSet(obstacles)
  const wallKeys = buildWallSet(walls)
  const myRole: Role = isChaser ? 'chaser' : 'evader'
  const validTargets = (!waitingForPartner && !winner)
    ? getValidTargets(currentStep, draft, myPos, opponentPos, obstacles, wallKeys, gameState, myRole, myPowerName, oppPowerName)
    : new Set<string>()

  const movePathKeys  = new Set<string>()
  if (draft.moveDest1) movePathKeys.add(hexKey(draft.moveDest1))
  if (draft.moveDest2) movePathKeys.add(hexKey(draft.moveDest2))
  const predPathKeys  = new Set(draft.predictDest ? [hexKey(draft.predictDest)] : [])
  const bonusPathKeys = new Set(draft.bonusMove ? [hexKey(draft.bonusMove)] : [])
  const unmaskedDestKeys = new Set(opponentUnmaskedDests.map(hexKey))

  const myColor       = isChaser ? '#ef4444' : '#3b82f6'
  const opponentColor = isChaser ? '#3b82f6' : '#ef4444'
  const bonusColor    = '#22c55e'

  function pp(a: HexCoord, b: HexCoord) {
    return pathPoints(a, b, offsetX, offsetY)
  }

  const tokenSize = HEX_SIZE * 1.0

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
          const { x, y } = cellToPixel(q, r)
          const cx = x + offsetX
          const cy = y + offsetY
          const key = `${q},${r}`
          const isObstacle = obstacleKeys.has(key)
          const isValid    = validTargets.has(key)
          const isMovePath = movePathKeys.has(key)
          const isPredPath = predPathKeys.has(key)
          const isBonusPath = bonusPathKeys.has(key)
          const isUnmaskedDest = unmaskedDestKeys.has(key)

          let fill = '#1a1a1a'
          if (isObstacle)           fill = '#2d1f1f'
          else if (isUnmaskedDest)  fill = '#292212'
          else if (isValid)         fill = '#1e293b'

          let stroke = '#2a2a2a'
          let strokeWidth = 0.8
          if (isObstacle)           { stroke = '#5a3030'; strokeWidth = 1 }
          else if (isUnmaskedDest)  { stroke = '#f59e0b'; strokeWidth = 2.5 }
          else if (isMovePath)      { stroke = myColor;   strokeWidth = 2 }
          else if (isBonusPath)     { stroke = bonusColor; strokeWidth = 2 }
          else if (isPredPath)      { stroke = '#a855f7'; strokeWidth = 2 }
          else if (isValid)         { stroke = '#60a5fa'; strokeWidth = 1.5 }

          return (
            <g key={key} style={{ cursor: isValid ? 'pointer' : 'default' }} onClick={() => isValid && onHexClick({ q, r })}>
              <polygon
                points={cellPolygonPoints(cx, cy)}
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
                  fontSize={10}
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

        {/* Move path arrow(s) */}
        {draft.moveDest1 && (() => {
          const { x1, y1, x2, y2 } = pp(myPos, draft.moveDest1)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={2.5} strokeOpacity={0.7}
            markerEnd="url(#arrow-move)" />
        })()}
        {draft.moveDest2 && draft.moveDest1 && (() => {
          const { x1, y1, x2, y2 } = pp(draft.moveDest1, draft.moveDest2)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={2.5} strokeOpacity={0.7}
            markerEnd="url(#arrow-move)" />
        })()}

        {/* Prediction path arrow (purple dashed) */}
        {draft.predictDest && (() => {
          const { x1, y1, x2, y2 } = pp(opponentPos, draft.predictDest)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#a855f7" strokeWidth={2} strokeOpacity={0.6}
            strokeDasharray="5 3" markerEnd="url(#arrow-pred)" />
        })()}

        {/* Bonus move arrow (green dashed, from planned final pos) */}
        {draft.bonusMove && (() => {
          const fromPos = draft.moveDest2 || draft.moveDest1
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
        const { x, y } = cellToPixel(opponentPos.q, opponentPos.r)
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
        const { x, y } = cellToPixel(myPos.q, myPos.r)
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
