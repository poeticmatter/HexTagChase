import { type JSX } from 'react'
import { motion } from 'motion/react'
import type { HexCoord, WallCoord } from '../types'
import { hexToPixel, getAllHexes, HEX_RADIUS } from '../lib/hexGrid'
import { obstacleSet, buildWallSet, validNeighbors, reachableDestinations } from '../lib/hexGameLogic'
import type { DraftPlan } from './PlanningPanel'
import type { UIStep } from '../types'

// ── Layout ────────────────────────────────────────────────────────────────────
const HEX_SIZE   = 38
const PADDING    = 52
const ISO_Y      = 0.55   // Vertical compression for isometric view
const BASE_ELEV  = 11     // Base tile elevation in screen pixels
const OBS_ELEV   = 26     // Obstacle tile elevation in screen pixels
const ELEV_VAR   = 3      // ±variation in normal tile elevation
const WALL_H     = 11     // Height of 3D wall barriers

// ── Color palette ─────────────────────────────────────────────────────────────
const ROCK_TOPS  = ['#8c8275', '#877c6e', '#918070', '#7e7568', '#8a7f72', '#938679']
const OBS_TOPS   = ['#6b5848', '#5e4f3d', '#735f4d', '#644f3e']
const MOSS_TONES = ['#4a7c3a', '#3d6b2e', '#5a8a48', '#466e38', '#527842', '#3f5e30', '#618f50']

// ── Per-tile utilities ────────────────────────────────────────────────────────

function hexKey(h: HexCoord): string { return `${h.q},${h.r}` }

/** Deterministic pseudo-random in [0, 1) for a given hex cell. */
function tileRand(q: number, r: number): number {
  let h = ((q * 2654435761) ^ (r * 2246822519)) >>> 0
  h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0
  // Mask to 16 bits then divide by 2^16 to guarantee [0, 1)
  return ((h >>> 16) & 0xffff) / 0x10000
}

function tileElevation(q: number, r: number, isObstacle: boolean): number {
  const rand = tileRand(q, r)
  if (isObstacle) return OBS_ELEV + (rand - 0.5) * 4
  return BASE_ELEV + (rand - 0.5) * 2 * ELEV_VAR
}

function tileTopColor(q: number, r: number, isObstacle: boolean): string {
  const rand = tileRand(q * 13, r * 7)
  if (isObstacle) return OBS_TOPS[Math.floor(rand * OBS_TOPS.length)]
  return ROCK_TOPS[Math.floor(rand * ROCK_TOPS.length)]
}

function darken(color: string, factor: number): string {
  let r = 0, g = 0, b = 0
  if (color.startsWith('#')) {
    r = parseInt(color.slice(1, 3), 16)
    g = parseInt(color.slice(3, 5), 16)
    b = parseInt(color.slice(5, 7), 16)
  } else {
    const m = color.match(/\d+/g)
    if (m) { r = +m[0]; g = +m[1]; b = +m[2] }
  }
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`
}

/** Screen coordinates for all 6 vertices of a tile's top face. */
function topFaceCoords(cx: number, cy: number, elev: number, size: number): [number, number][] {
  return hexVertOffsets(size).map(([dx, dy]) => [cx + dx, cy - elev + dy])
}

/**
 * Moss nestled in the edge cracks of a tile.
 * Places tiny flat ellipses just inside each selected edge, oriented along it,
 * so they look like growth emerging from the crack between adjacent tiles.
 */
function mossEdgeAccents(cx: number, cy: number, elev: number, q: number, r: number): JSX.Element[] {
  const verts = topFaceCoords(cx, cy, elev, HEX_SIZE)
  const accents: JSX.Element[] = []
  let key = 0

  for (let e = 0; e < 6; e++) {
    if (tileRand(q * 7 + e * 3, r * 11 + e) > 0.52) continue  // ~52% of edges get moss

    const [ax, ay] = verts[e]
    const [bx, by] = verts[(e + 1) % 6]
    const dx = bx - ax, dy = by - ay
    const len = Math.sqrt(dx * dx + dy * dy)
    const ex = dx / len, ey = dy / len  // unit vector along edge

    // Inward normal pointing toward tile center from edge midpoint
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    const cnx = cx - mx, cny = (cy - elev) - my
    const cnLen = Math.sqrt(cnx * cnx + cny * cny)
    const nx = cnx / cnLen, ny = cny / cnLen

    const numTufts = 3 + Math.floor(tileRand(q * 5 + e, r * 13 + e) * 3)  // 3–5 per edge

    for (let t = 0; t < numTufts; t++) {
      const rand1 = tileRand(q * 31 + e * 7 + t * 3, r * 17 + e + t)
      const rand2 = tileRand(q * 19 + t * 5, r * 29 + e * 3 + t)

      const along = (t + 0.5 + (rand1 - 0.5) * 0.55) / numTufts
      const inset = 1.5 + rand2 * 2.0  // 1.5–3.5 px inward from the edge crack

      const px = ax + dx * along + nx * inset
      const py = ay + dy * along + ny * inset

      const color = MOSS_TONES[Math.floor(tileRand(q * 11 + e * 5 + t, r * 37 + t) * MOSS_TONES.length)]
      const scale = tileRand(q * 23 + e + t * 7, r * 41 + t)
      const rx = 1.4 + scale * 2.2   // 1.4–3.6 px along edge
      const ry = 0.5 + scale * 0.9   // 0.5–1.4 px depth — very flat, hug the crack

      accents.push(
        <ellipse
          key={key++}
          cx={px} cy={py}
          rx={rx} ry={ry}
          fill={color}
          opacity={0.70 + scale * 0.25}
          transform={`rotate(${(Math.atan2(ey, ex) * 180 / Math.PI).toFixed(1)},${px.toFixed(1)},${py.toFixed(1)})`}
          style={{ pointerEvents: 'none' }}
        />,
      )
    }
  }
  return accents
}

// ── Isometric geometry ────────────────────────────────────────────────────────

function boardDimensions() {
  const worldExtentY = Math.sqrt(3) * HEX_SIZE * (2 * HEX_RADIUS + 1)
  const isoExtentY   = worldExtentY * ISO_Y
  const worldExtentX = (3 * HEX_RADIUS + 2) * HEX_SIZE
  const maxElev      = OBS_ELEV + 4 + WALL_H

  const width   = worldExtentX + PADDING * 2
  const height  = isoExtentY + maxElev + PADDING * 2
  // offsetX/offsetY: screen coordinates of world origin at ground level
  const offsetX = width / 2
  const offsetY = isoExtentY / 2 + maxElev + PADDING

  return { width, height, offsetX, offsetY }
}

/** Screen coordinates of a hex's ground-level center. */
function isoCenter(q: number, r: number, offsetX: number, offsetY: number) {
  const { x, y } = hexToPixel(q, r, HEX_SIZE)
  return { cx: x + offsetX, cy: y * ISO_Y + offsetY }
}

/**
 * The 6 vertex offsets for a flat-top hex in isometric screen space.
 * The y offset has ISO_Y already applied.
 */
function hexVertOffsets(size: number): [number, number][] {
  const h = (Math.sqrt(3) / 2) * size
  return [
    [+size,     0        ],  // 0 right
    [+size / 2, +h * ISO_Y],  // 1 lower-right
    [-size / 2, +h * ISO_Y],  // 2 lower-left
    [-size,     0        ],  // 3 left
    [-size / 2, -h * ISO_Y],  // 4 upper-left
    [+size / 2, -h * ISO_Y],  // 5 upper-right
  ]
}

/** SVG points string for a tile's top face (inset size, elevated). */
function topFacePts(cx: number, cy: number, elev: number, size: number): string {
  return hexVertOffsets(size)
    .map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy - elev + dy).toFixed(1)}`)
    .join(' ')
}

/**
 * SVG points string for one visible side face quad.
 * Uses full HEX_SIZE so sides extend to tile boundary regardless of top inset.
 * vIdx: 0=right face, 1=bottom face, 2=left face (the three viewer-facing sides).
 */
function sideFacePts(cx: number, cy: number, elev: number, vIdx: number): string {
  const offs = hexVertOffsets(HEX_SIZE)
  const va = offs[vIdx]
  const vb = offs[(vIdx + 1) % 6]
  const ax = (cx + va[0]).toFixed(1), ay_top = (cy - elev + va[1]).toFixed(1)
  const bx = (cx + vb[0]).toFixed(1), by_top = (cy - elev + vb[1]).toFixed(1)
  const ay_gnd = (cy + va[1]).toFixed(1), by_gnd = (cy + vb[1]).toFixed(1)
  return `${ax},${ay_top} ${bx},${by_top} ${bx},${by_gnd} ${ax},${ay_gnd}`
}

// ── Wall geometry ─────────────────────────────────────────────────────────────

const HEX_H = (Math.sqrt(3) / 2) * HEX_SIZE

const WALL_EDGE_OFFSETS: Record<string, [[number, number], [number, number]]> = {
  '0,-1':  [[-HEX_SIZE / 2, -HEX_H], [HEX_SIZE / 2, -HEX_H]],
  '1,-1':  [[HEX_SIZE / 2,  -HEX_H], [HEX_SIZE, 0]],
  '1,0':   [[HEX_SIZE,      0      ], [HEX_SIZE / 2, HEX_H]],
  '0,1':   [[HEX_SIZE / 2,  HEX_H ], [-HEX_SIZE / 2, HEX_H]],
  '-1,1':  [[-HEX_SIZE / 2, HEX_H ], [-HEX_SIZE, 0]],
  '-1,0':  [[-HEX_SIZE,     0      ], [-HEX_SIZE / 2, -HEX_H]],
}

interface WallEdgePoints {
  x1: number; y1: number
  x2: number; y2: number
}

function wallEdgeIso(
  q1: number, r1: number, q2: number, r2: number,
  elev: number,
  offsetX: number, offsetY: number,
): WallEdgePoints | null {
  const offs = WALL_EDGE_OFFSETS[`${q2 - q1},${r2 - r1}`]
  if (!offs) return null
  const { x: ax, y: ay } = hexToPixel(q1, r1, HEX_SIZE)
  return {
    x1: ax + offs[0][0] + offsetX,
    y1: (ay + offs[0][1]) * ISO_Y + offsetY - elev,
    x2: ax + offs[1][0] + offsetX,
    y2: (ay + offs[1][1]) * ISO_Y + offsetY - elev,
  }
}

// ── Game logic helpers ────────────────────────────────────────────────────────

function getValidTargets(
  step: UIStep | 'ready',
  draft: DraftPlan,
  myPos: HexCoord,
  opponentPos: HexCoord,
  obstacles: HexCoord[],
  walls: Set<string>,
): Set<string> {
  const blocked = obstacleSet(obstacles)
  switch (step) {
    case 'select_movement':
      return new Set(reachableDestinations(myPos, blocked, walls).map(hexKey))
    case 'select_prediction':
      return new Set(reachableDestinations(opponentPos, blocked, walls).map(hexKey))
    case 'select_bonus':
      return new Set(validNeighbors(draft.moveDest ?? myPos, blocked, walls).map(hexKey))
    case 'ready':
      return new Set()
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  myPos: HexCoord
  opponentPos: HexCoord
  prevMyPath: HexCoord[] | null
  prevOpponentPath: HexCoord[] | null
  /** Committed movement paths for this turn (post-reveal bonus_phase display). */
  committedMyPath: HexCoord[] | null
  committedOpponentPath: HexCoord[] | null
  isChaser: boolean
  obstacles: HexCoord[]
  walls: WallCoord[]
  currentStep: UIStep | 'ready'
  draft: DraftPlan
  waitingForPartner: boolean
  winner: 'chaser' | 'evader' | null
  showCoords: boolean
  onHexClick: (hex: HexCoord) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HexBoard({
  myPos, opponentPos,
  prevMyPath, prevOpponentPath,
  committedMyPath, committedOpponentPath,
  isChaser, obstacles, walls,
  currentStep, draft, waitingForPartner, winner,
  showCoords, onHexClick,
}: Props) {
  const { width, height, offsetX, offsetY } = boardDimensions()

  // Sort back-to-front: smaller (2r + q) is further from the viewer
  const sortedCells = getAllHexes().sort((a, b) => (2 * a.r + a.q) - (2 * b.r + b.q))

  const obstacleKeys = obstacleSet(obstacles)
  const wallKeys     = buildWallSet(walls)
  const validTargets = (!waitingForPartner && !winner)
    ? getValidTargets(currentStep, draft, myPos, opponentPos, obstacles, wallKeys)
    : new Set<string>()

  const myColor       = isChaser ? '#ef4444' : '#3b82f6'
  const opponentColor = isChaser ? '#3b82f6' : '#ef4444'
  const bonusColor    = '#22c55e'

  /** Screen coordinates of the top surface center of a tile. */
  function tileSurface(q: number, r: number) {
    const { cx, cy } = isoCenter(q, r, offsetX, offsetY)
    const elev = tileElevation(q, r, obstacleKeys.has(`${q},${r}`))
    return { x: cx, y: cy - elev }
  }

  function pathArrow(
    from: HexCoord, to: HexCoord,
    color: string, opacity: number, markerId: string, dash?: string,
  ) {
    const a = tileSurface(from.q, from.r)
    const b = tileSurface(to.q, to.r)
    return (
      <line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={color} strokeWidth={2.5} strokeOpacity={opacity}
        strokeDasharray={dash}
        markerEnd={`url(#${markerId})`}
      />
    )
  }

  function pathSegments(
    path: HexCoord[], color: string, opacity: number,
    markerId: string, keyPrefix: string,
  ) {
    return path.slice(0, -1).map((from, i) => {
      const to = path[i + 1]
      const a  = tileSurface(from.q, from.r)
      const b  = tileSurface(to.q, to.r)
      const isLast = i === path.length - 2
      return (
        <line
          key={`${keyPrefix}-${i}`}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={color} strokeWidth={2.5} strokeOpacity={opacity}
          markerEnd={isLast ? `url(#${markerId})` : undefined}
        />
      )
    })
  }

  return (
    <svg
      width={width} height={height}
      style={{ display: 'block', userSelect: 'none' }}
    >
      <defs>
        {/* Water gradient */}
        <radialGradient id="water-bg" cx="50%" cy="50%" r="72%">
          <stop offset="0%"   stopColor="#0e3d6e" />
          <stop offset="55%"  stopColor="#0b3060" />
          <stop offset="100%" stopColor="#071e40" />
        </radialGradient>

        {/*
          Board-wide directional light: upper-left → lower-right.
          gradientUnits="userSpaceOnUse" with the full SVG viewport as the span
          so tiles at different positions show a different point on the gradient —
          not each tile getting its own identical mini-gradient.
        */}
        <linearGradient id="face-light"
          gradientUnits="userSpaceOnUse"
          x1="0" y1="0" x2={width} y2={height}>
          <stop offset="0%"   stopColor="white" stopOpacity="0.22" />
          <stop offset="42%"  stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.22" />
        </linearGradient>

        {/* Subtle wave pattern */}
        <pattern id="water-waves" x="0" y="0" width="64" height="32" patternUnits="userSpaceOnUse">
          <path d="M0 16 Q16 8 32 16 Q48 24 64 16"  fill="none" stroke="#1c6ab4" strokeWidth="1.2" opacity="0.3"/>
          <path d="M0 24 Q16 16 32 24 Q48 32 64 24" fill="none" stroke="#1c6ab4" strokeWidth="0.7" opacity="0.18"/>
        </pattern>

        {/* Arrow markers */}
        {([
          ['arrow-move',         myColor,       1.0],
          ['arrow-pred',         '#a855f7',     0.75],
          ['arrow-bonus',        bonusColor,    1.0],
          ['arrow-last-my',      myColor,       0.5],
          ['arrow-last-opp',     opponentColor, 0.5],
          ['arrow-commit-my',    myColor,       1.0],
          ['arrow-commit-opp',   opponentColor, 1.0],
        ] as [string, string, number][]).map(([id, fill, op]) => (
          <marker key={id} id={id} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill={fill} fillOpacity={op} />
          </marker>
        ))}
      </defs>

      {/* ── Water ── */}
      <rect width={width} height={height} fill="url(#water-bg)" />
      <rect width={width} height={height} fill="url(#water-waves)" />

      {/*
        ── Cast shadows (pre-pass, before all tiles) ──
        Each tile casts a dark offset polygon onto the water below it.
        Shadow offset grows with elevation so taller rocks cast longer shadows.
      */}
      {sortedCells.map(({ q, r }) => {
        const { cx, cy } = isoCenter(q, r, offsetX, offsetY)
        const elev = tileElevation(q, r, obstacleKeys.has(`${q},${r}`))
        const sdx = 2 + elev * 0.20
        const sdy = 4 + elev * 0.34
        const pts = hexVertOffsets(HEX_SIZE)
          .map(([dx, dy]) => `${(cx + dx + sdx).toFixed(1)},${(cy + dy + sdy).toFixed(1)}`)
          .join(' ')
        return <polygon key={`sh-${q},${r}`} points={pts} fill="#000d1a" opacity={0.30} />
      })}

      {/* ── Hex tiles (back to front) ── */}
      {sortedCells.map(({ q, r }) => {
        const key = `${q},${r}`
        const { cx, cy } = isoCenter(q, r, offsetX, offsetY)
        const isObstacle = obstacleKeys.has(key)
        const isValid    = validTargets.has(key)
        const isMovePick  = !!(draft.moveDest    && hexKey(draft.moveDest)    === key)
        const isBonusPick = !!(draft.bonusMove   && hexKey(draft.bonusMove)   === key)
        const isPredPick  = !!(draft.predictDest && hexKey(draft.predictDest) === key)

        const elev = tileElevation(q, r, isObstacle)

        let topColor = tileTopColor(q, r, isObstacle)
        if (isValid)                  topColor = '#5d9ab5'
        if (isMovePick || isBonusPick) topColor = '#3d9e6a'
        if (isPredPick)                topColor = '#8b5cc4'

        const sideR = darken(topColor, 0.68)
        const sideB = darken(topColor, 0.55)
        const sideL = darken(topColor, 0.63)

        let topStroke = 'none'
        let topStrokeW = 0
        if (isValid)                   { topStroke = '#7ec8e3'; topStrokeW = 1.2 }
        if (isMovePick || isBonusPick) { topStroke = '#6edba0'; topStrokeW = 1.5 }
        if (isPredPick)                { topStroke = '#c4a0e8'; topStrokeW = 1.5 }

        return (
          <g
            key={key}
            style={{ cursor: isValid ? 'pointer' : 'default' }}
            onClick={() => isValid && onHexClick({ q, r })}
          >
            {/* Three viewer-facing side faces (right → bottom → left) */}
            <polygon points={sideFacePts(cx, cy, elev, 0)} fill={sideR} />
            <polygon points={sideFacePts(cx, cy, elev, 1)} fill={sideB} />
            <polygon points={sideFacePts(cx, cy, elev, 2)} fill={sideL} />

            {/* Top face */}
            <polygon
              points={topFacePts(cx, cy, elev, HEX_SIZE)}
              fill={topColor}
              stroke={topStroke}
              strokeWidth={topStrokeW}
            />

            {/* Directional light overlay — same shape, gradient fill */}
            <polygon
              points={topFacePts(cx, cy, elev, HEX_SIZE)}
              fill="url(#face-light)"
              style={{ pointerEvents: 'none' }}
            />

            {/* Edge highlights: upper edges catch light (vertices 3→4→5→0) */}
            {(() => {
              const v = topFaceCoords(cx, cy, elev, HEX_SIZE)
              const hi = [3, 4, 5, 0].map(i => `${v[i][0].toFixed(1)},${v[i][1].toFixed(1)}`).join(' ')
              const sh = [0, 1, 2, 3].map(i => `${v[i][0].toFixed(1)},${v[i][1].toFixed(1)}`).join(' ')
              return (
                <>
                  <polyline points={hi} fill="none" stroke="white" strokeWidth={0.9} strokeOpacity={0.30} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                  <polyline points={sh} fill="none" stroke="black" strokeWidth={0.9} strokeOpacity={0.20} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                </>
              )
            })()}

            {/* Moss / seaweed in edge cracks — only on plain, non-interactive tiles */}
            {!isObstacle && !isValid && !isMovePick && !isBonusPick && !isPredPick
              && mossEdgeAccents(cx, cy, elev, q, r)}

            {showCoords && (
              <text
                x={cx} y={cy - elev + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fontWeight="600"
                fill={isObstacle ? '#c4a898' : '#d4cec8'}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {q},{r}
              </text>
            )}
          </g>
        )
      })}

      {/*
        ── Walls ──
        Rendered as flat edge lines sitting on the tile surface rather than
        3D quads — quads cause Z-fighting and topological intersections at
        shared vertices. Three stacked lines give the illusion of a raised ridge.
      */}
      {walls.map(({ q1, r1, q2, r2 }) => {
        const elev1 = tileElevation(q1, r1, obstacleKeys.has(`${q1},${r1}`))
        const elev2 = tileElevation(q2, r2, obstacleKeys.has(`${q2},${r2}`))
        // Sit the wall on the higher of the two adjacent tile surfaces
        const elev = Math.max(elev1, elev2)
        const e = wallEdgeIso(q1, r1, q2, r2, elev, offsetX, offsetY)
        if (!e) return null
        return (
          <g key={`wall-${q1},${r1}>${q2},${r2}`} style={{ pointerEvents: 'none' }}>
            {/* Shadow line below */}
            <line x1={e.x1} y1={e.y1 + 2} x2={e.x2} y2={e.y2 + 2}
              stroke="#1a0808" strokeWidth={5} strokeLinecap="round" strokeOpacity={0.55} />
            {/* Main wall ridge */}
            <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="#8b3333" strokeWidth={4} strokeLinecap="round" />
            {/* Highlight on top edge */}
            <line x1={e.x1} y1={e.y1 - 1.5} x2={e.x2} y2={e.y2 - 1.5}
              stroke="#cc5555" strokeWidth={1.5} strokeLinecap="round" />
          </g>
        )
      })}

      {/* ── Path arrows ── */}

      {draft.moveDest && pathArrow(myPos, draft.moveDest, myColor, 0.85, 'arrow-move')}

      {draft.predictDest && (() => {
        const a = tileSurface(opponentPos.q, opponentPos.r)
        const b = tileSurface(draft.predictDest.q, draft.predictDest.r)
        return (
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#a855f7" strokeWidth={2} strokeOpacity={0.65}
            strokeDasharray="5 3" markerEnd="url(#arrow-pred)" />
        )
      })()}

      {draft.bonusMove && (() => {
        const from = draft.moveDest ?? myPos
        const a = tileSurface(from.q, from.r)
        const b = tileSurface(draft.bonusMove.q, draft.bonusMove.r)
        return (
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={bonusColor} strokeWidth={2} strokeOpacity={0.75}
            strokeDasharray="5 3" markerEnd="url(#arrow-bonus)" />
        )
      })()}

      {committedMyPath   && pathSegments(committedMyPath,   myColor,       0.85, 'arrow-commit-my',  'cm')}
      {committedOpponentPath && pathSegments(committedOpponentPath, opponentColor, 0.85, 'arrow-commit-opp', 'co')}
      {prevMyPath        && pathSegments(prevMyPath,        myColor,       0.30, 'arrow-last-my',    'pm')}
      {prevOpponentPath  && pathSegments(prevOpponentPath,  opponentColor, 0.30, 'arrow-last-opp',   'po')}

      {/* ── Player cylinders ── */}
      {[
        { pos: opponentPos, color: opponentColor, label: isChaser ? 'E' : 'C' },
        { pos: myPos,       color: myColor,       label: isChaser ? 'C' : 'E' },
      ].map(({ pos, color, label }) => {
        const { x, y } = tileSurface(pos.q, pos.r)
        return (
          <motion.g
            key={label}
            initial={false}
            animate={{ x, y }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <PlayerCylinder color={color} label={label} />
          </motion.g>
        )
      })}

      {/* ── Win overlay ── */}
      {winner && (
        <g>
          <rect width={width} height={height} fill="rgba(0,0,0,0.58)" />
          <rect
            x={width / 2 - 94} y={height / 2 - 26}
            width={188} height={52}
            rx={11}
            fill={winner === 'chaser' ? 'rgba(120,27,27,0.88)' : 'rgba(20,35,90,0.88)'}
          />
          <text
            x={width / 2} y={height / 2 + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={21} fontWeight="700"
            fill={winner === 'chaser' ? '#fca5a5' : '#93c5fd'}
          >
            {winner === 'chaser' ? 'Tagged!' : 'Evader survives!'}
          </text>
        </g>
      )}
    </svg>
  )
}

// ── PlayerCylinder ────────────────────────────────────────────────────────────
// Drawn with its base at (0, 0) — the parent motion.g positions it on the tile surface.

function PlayerCylinder({ color, label }: { color: string; label: string }) {
  const r  = 9
  const h  = 17
  const ry = r * ISO_Y

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Cylinder body */}
      <rect x={-r} y={-h} width={r * 2} height={h} fill={darken(color, 0.76)} />
      {/* Base ellipse (resting on tile surface) */}
      <ellipse cx={0} cy={0} rx={r} ry={ry} fill={darken(color, 0.60)} />
      {/* Top cap */}
      <ellipse cx={0} cy={-h} rx={r} ry={ry} fill={color} />
      {/* Label on top cap */}
      <text
        x={0} y={-h}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fontWeight="800" fill="white"
      >
        {label}
      </text>
    </g>
  )
}
