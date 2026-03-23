import { motion } from 'motion/react'
import type { HexCoord } from '../types'
import { hexToPixel, hexPolygonPoints, getAllHexes, HEX_RADIUS } from '../lib/hexGrid'
import { obstacleSet, validNeighbors } from '../lib/hexGameLogic'
import type { PlanningPhase, DraftPlan } from './PlanningPanel'

const HEX_SIZE = 38
const PADDING  = 30

const SVG_WIDTH  = (3 * HEX_RADIUS + 2) * HEX_SIZE + PADDING * 2
const SVG_HEIGHT = Math.sqrt(3) * HEX_SIZE * (2 * HEX_RADIUS + 1) + PADDING * 2
const OFFSET_X   = SVG_WIDTH  / 2
const OFFSET_Y   = SVG_HEIGHT / 2

const ALL_HEXES = getAllHexes()

function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`
}

function getValidTargets(
  phase: PlanningPhase,
  draft: DraftPlan,
  myPos: HexCoord,
  opponentPos: HexCoord,
  obstacles: HexCoord[],
): Set<string> {
  const blocked = obstacleSet(obstacles)

  switch (phase) {
    case 'move_step1': {
      // Adjacent to my position, not blocked, not opponent
      const opponentKey = hexKey(opponentPos)
      return new Set(
        validNeighbors(myPos, blocked)
          .filter(h => hexKey(h) !== opponentKey)
          .map(hexKey)
      )
    }
    case 'move_step2': {
      if (!draft.moveStep1) return new Set()
      const opponentKey = hexKey(opponentPos)
      return new Set(
        validNeighbors(draft.moveStep1, blocked)
          .filter(h => hexKey(h) !== opponentKey)
          .map(hexKey)
      )
    }
    case 'predict_step1': {
      return new Set(validNeighbors(opponentPos, blocked).map(hexKey))
    }
    case 'predict_step2': {
      if (!draft.predictStep1) return new Set()
      return new Set(validNeighbors(draft.predictStep1, blocked).map(hexKey))
    }
    case 'ready':
      return new Set()
  }
}

function pathPoints(a: HexCoord, b: HexCoord): { x1: number; y1: number; x2: number; y2: number } {
  const pa = hexToPixel(a.q, a.r, HEX_SIZE)
  const pb = hexToPixel(b.q, b.r, HEX_SIZE)
  return {
    x1: pa.x + OFFSET_X,
    y1: pa.y + OFFSET_Y,
    x2: pb.x + OFFSET_X,
    y2: pb.y + OFFSET_Y,
  }
}

interface Props {
  myPos: HexCoord
  opponentPos: HexCoord
  prevMyPath: HexCoord[] | null
  prevOpponentPath: HexCoord[] | null
  isChaser: boolean
  obstacles: HexCoord[]
  planningPhase: PlanningPhase
  draft: DraftPlan
  waitingForPartner: boolean
  winner: 'chaser' | 'evader' | null
  onHexClick: (hex: HexCoord) => void
}

export function HexBoard({
  myPos,
  opponentPos,
  prevMyPath,
  prevOpponentPath,
  isChaser,
  obstacles,
  planningPhase,
  draft,
  waitingForPartner,
  winner,
  onHexClick,
}: Props) {
  const obstacleKeys = obstacleSet(obstacles)
  const validTargets = (!waitingForPartner && !winner)
    ? getValidTargets(planningPhase, draft, myPos, opponentPos, obstacles)
    : new Set<string>()

  // Hexes that are part of the draft plan
  const movePathKeys  = new Set([draft.moveStep1, draft.moveStep2].filter(Boolean).map(h => hexKey(h!)))
  const predPathKeys  = new Set([draft.predictStep1, draft.predictStep2].filter(Boolean).map(h => hexKey(h!)))

  const myColor       = isChaser ? '#ef4444' : '#3b82f6'   // red or blue
  const opponentColor = isChaser ? '#3b82f6' : '#ef4444'

  return (
    <div className="relative select-none" style={{ width: SVG_WIDTH, height: SVG_HEIGHT }}>
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        className="absolute inset-0"
      >
        <defs>
          <marker id="arrow-move" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={myColor} />
          </marker>
          <marker id="arrow-pred" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="#a855f7" fillOpacity="0.7" />
          </marker>
          <marker id="arrow-last-my" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={myColor} fillOpacity="0.5" />
          </marker>
          <marker id="arrow-last-opp" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={opponentColor} fillOpacity="0.5" />
          </marker>
        </defs>

        {/* Hex cells */}
        {ALL_HEXES.map(({ q, r }) => {
          const { x, y } = hexToPixel(q, r, HEX_SIZE)
          const cx = x + OFFSET_X
          const cy = y + OFFSET_Y
          const key = `${q},${r}`
          const isObstacle = obstacleKeys.has(key)
          const isValid    = validTargets.has(key)
          const isMovePath = movePathKeys.has(key)
          const isPredPath = predPathKeys.has(key)

          let fill = '#1a1a1a'
          if (isObstacle)   fill = '#2d1f1f'
          else if (isValid) fill = '#1e293b'

          let stroke = '#2a2a2a'
          let strokeWidth = 0.8
          if (isObstacle)   { stroke = '#5a3030'; strokeWidth = 1 }
          else if (isMovePath) { stroke = myColor; strokeWidth = 2 }
          else if (isPredPath) { stroke = '#a855f7'; strokeWidth = 2 }
          else if (isValid)    { stroke = '#60a5fa'; strokeWidth = 1.5 }

          return (
            <polygon
              key={key}
              points={hexPolygonPoints(cx, cy, HEX_SIZE - 1.5)}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeOpacity={isValid ? 0.9 : 1}
              style={{ cursor: isValid ? 'pointer' : 'default' }}
              onClick={() => isValid && onHexClick({ q, r })}
            />
          )
        })}

        {/* Move path arrows */}
        {draft.moveStep1 && (() => {
          const { x1, y1, x2, y2 } = pathPoints(myPos, draft.moveStep1)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={2.5} strokeOpacity={0.7}
            markerEnd="url(#arrow-move)" />
        })()}
        {draft.moveStep1 && draft.moveStep2 && (() => {
          const { x1, y1, x2, y2 } = pathPoints(draft.moveStep1!, draft.moveStep2)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={myColor} strokeWidth={2.5} strokeOpacity={0.7}
            markerEnd="url(#arrow-move)" />
        })()}

        {/* Prediction path arrows (purple dashed) */}
        {draft.predictStep1 && (() => {
          const { x1, y1, x2, y2 } = pathPoints(opponentPos, draft.predictStep1)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#a855f7" strokeWidth={2} strokeOpacity={0.6}
            strokeDasharray="5 3" markerEnd="url(#arrow-pred)" />
        })()}
        {draft.predictStep1 && draft.predictStep2 && (() => {
          const { x1, y1, x2, y2 } = pathPoints(draft.predictStep1!, draft.predictStep2)
          return <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#a855f7" strokeWidth={2} strokeOpacity={0.6}
            strokeDasharray="5 3" markerEnd="url(#arrow-pred)" />
        })()}

        {/* Last-round movement arrows: one segment per step */}
        {prevMyPath && prevMyPath.slice(0, -1).map((from, i) => {
          const to = prevMyPath[i + 1]
          const { x1, y1, x2, y2 } = pathPoints(from, to)
          const isLast = i === prevMyPath.length - 2
          return (
            <line key={`my-step-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={myColor} strokeWidth={2} strokeOpacity={0.35}
              markerEnd={isLast ? 'url(#arrow-last-my)' : undefined} />
          )
        })}
        {prevOpponentPath && prevOpponentPath.slice(0, -1).map((from, i) => {
          const to = prevOpponentPath[i + 1]
          const { x1, y1, x2, y2 } = pathPoints(from, to)
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
        const { x, y } = hexToPixel(opponentPos.q, opponentPos.r, HEX_SIZE)
        const tokenSize = HEX_SIZE * 1.0
        return (
          <motion.div
            key="opponent"
            initial={false}
            animate={{ x: x + OFFSET_X - tokenSize / 2, y: y + OFFSET_Y - tokenSize / 2 }}
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
        const { x, y } = hexToPixel(myPos.q, myPos.r, HEX_SIZE)
        const tokenSize = HEX_SIZE * 1.1
        return (
          <motion.div
            key="mine"
            initial={false}
            animate={{ x: x + OFFSET_X - tokenSize / 2, y: y + OFFSET_Y - tokenSize / 2 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            style={{
              position: 'absolute',
              width: tokenSize,
              height: tokenSize,
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
