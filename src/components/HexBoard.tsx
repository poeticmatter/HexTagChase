import { type JSX } from 'react'
import { motion } from 'motion/react'
import type { HexCoord, WallCoord } from '../types'
import { hexToPixel, getAllHexes, HEX_RADIUS } from '../lib/hexGrid'
import { getBaseElevation, tileRand } from '../lib/topography'
import type { DraftPlan } from './PlanningPanel'
import type { UIStep } from '../types'

// ── Layout ────────────────────────────────────────────────────────────────────
const HEX_SIZE   = 38
const PADDING    = 52
const WALL_H     = 11     // Height of 3D wall barriers

// Screen-space shadow vector (lower-right, matching the face-light gradient direction).
// Applied per elevation unit: [dx, dy] in SVG pixels.
const SHADOW_VEC: [number, number] = [0.8, 0.5]

// ── Color palette ─────────────────────────────────────────────────────────────
const ROCK_TOPS  = ['#8c8275', '#877c6e', '#918070', '#7e7568', '#8a7f72', '#938679']
const OBS_TOPS   = ['#6b5848', '#5e4f3d', '#735f4d', '#644f3e']
const MOSS_TONES = ['#4a7c3a', '#3d6b2e', '#5a8a48', '#466e38', '#527842', '#3f5e30', '#618f50']
const PIT_VOID   = ['#1a1a2e', '#16213e', '#0f0f1a']
const PIT_WALLS  = ['#2a2a3e', '#1e1e30']

// ── Per-tile utilities ────────────────────────────────────────────────────────

function hexKey(h: HexCoord): string { return `${h.q},${h.r}` }

/**
 * Calculates visual elevation based on the game-logic integer base level plus PRNG noise.
 * Note: Base elevation 0 visually corresponds to 11px. Base elevation 1 is 26px.
 * The scaling handles higher elevations by adding an offset per level.
 */
function tileVisualElevation(q: number, r: number, baseLevel: number, isOrtho: boolean = false): number {
  if (isOrtho) return 0
  const rand = tileRand(q, r)

  if (baseLevel === -1) {
    return -20 + (rand - 0.5) * 4
  } else if (baseLevel === 0) {
    return 11 + (rand - 0.5) * 2 * 3 // BASE_ELEV = 11, ELEV_VAR = 3
  } else {
    // For level >= 1, we match the old "obstacle" look (26px) for level 1
    // and stack higher for level 2+
    return 26 + ((baseLevel - 1) * 15) + (rand - 0.5) * 4
  }
}

function tileTopColor(q: number, r: number, baseLevel: number): string {
  const rand = tileRand(q * 13, r * 7)
  if (baseLevel === -1) return PIT_VOID[Math.floor(rand * PIT_VOID.length)]
  if (baseLevel > 0) return OBS_TOPS[Math.floor(rand * OBS_TOPS.length)]
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
function topFaceCoords(cx: number, cy: number, elev: number, size: number, isoY: number): [number, number][] {
  return hexVertOffsets(size, isoY).map(([dx, dy]) => [cx + dx, cy - elev + dy])
}

/**
 * Moss nestled in the edge cracks of a tile.
 * Places tiny flat ellipses just inside each selected edge, oriented along it,
 * so they look like growth emerging from the crack between adjacent tiles.
 */
function mossEdgeAccents(cx: number, cy: number, elev: number, q: number, r: number, isoY: number): JSX.Element[] {
  const verts = topFaceCoords(cx, cy, elev, HEX_SIZE, isoY)
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

function boardDimensions(isoY: number) {
  const worldExtentY = Math.sqrt(3) * HEX_SIZE * (2 * HEX_RADIUS + 1)
  const isoExtentY   = worldExtentY * isoY
  const worldExtentX = (3 * HEX_RADIUS + 2) * HEX_SIZE
  const maxElev      = isoY === 1.0 ? 0 : 26 + 4 + WALL_H

  const width   = worldExtentX + PADDING * 2
  const height  = isoExtentY + maxElev + PADDING * 2
  // offsetX/offsetY: screen coordinates of world origin at ground level
  const offsetX = width / 2
  const offsetY = isoExtentY / 2 + maxElev + PADDING

  return { width, height, offsetX, offsetY }
}

/** Screen coordinates of a hex's ground-level center. */
function isoCenter(q: number, r: number, offsetX: number, offsetY: number, isoY: number) {
  const { x, y } = hexToPixel(q, r, HEX_SIZE)
  return { cx: x + offsetX, cy: y * isoY + offsetY }
}

/**
 * The 6 vertex offsets for a flat-top hex in isometric screen space.
 * The y offset has isoY already applied.
 */
function hexVertOffsets(size: number, isoY: number): [number, number][] {
  const h = (Math.sqrt(3) / 2) * size
  return [
    [+size,     0        ],  // 0 right
    [+size / 2, +h * isoY],  // 1 lower-right
    [-size / 2, +h * isoY],  // 2 lower-left
    [-size,     0        ],  // 3 left
    [-size / 2, -h * isoY],  // 4 upper-left
    [+size / 2, -h * isoY],  // 5 upper-right
  ]
}

/** SVG points string for a tile's top face (inset size, elevated). */
function topFacePts(cx: number, cy: number, elev: number, size: number, isoY: number): string {
  return hexVertOffsets(size, isoY)
    .map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy - elev + dy).toFixed(1)}`)
    .join(' ')
}

/**
 * SVG points string for one visible side face quad.
 * Uses full HEX_SIZE so sides extend to tile boundary regardless of top inset.
 * vIdx: 0=right face, 1=bottom face, 2=left face (the three viewer-facing sides).
 */
function sideFacePts(cx: number, cy: number, elev: number, vIdx: number, isoY: number): string {
  const offs = hexVertOffsets(HEX_SIZE, isoY)
  const va = offs[vIdx]
  const vb = offs[(vIdx + 1) % 6]
  const ax = (cx + va[0]).toFixed(1), ay_top = (cy - elev + va[1]).toFixed(1)
  const bx = (cx + vb[0]).toFixed(1), by_top = (cy - elev + vb[1]).toFixed(1)
  const ay_gnd = (cy + va[1]).toFixed(1), by_gnd = (cy + vb[1]).toFixed(1)
  return `${ax},${ay_top} ${bx},${by_top} ${bx},${by_gnd} ${ax},${ay_gnd}`
}

// ── Depth heuristic ───────────────────────────────────────────────────────────

/** Painter's Algorithm depth score: lower = further from viewer. */
function tileDepth(q: number, r: number): number { return 2 * r + q }

// ── Renderable queue ──────────────────────────────────────────────────────────

type RenderableHex = {
  type: 'hex'
  q: number; r: number
  depth: number
}
type RenderableWall = {
  type: 'wall'
  wall: WallCoord
  depth: number
}
type RenderablePath = {
  type: 'path'
  from: HexCoord; to: HexCoord
  depth: number
  color: string; opacity: number
  markerId: string | undefined
  dash: string | undefined
  keyStr: string
}
type Renderable = RenderableHex | RenderableWall | RenderablePath

// ── Wall geometry ─────────────────────────────────────────────────────────────

const HEX_H = (Math.sqrt(3) / 2) * HEX_SIZE

const WALL_EDGE_OFFSETS: Record<string, [[number, number], [number, number]]> = {
  '1,-1':  [[HEX_SIZE / 2,  -HEX_H], [HEX_SIZE, 0]],
  '1,0':   [[HEX_SIZE,      0      ], [HEX_SIZE / 2, HEX_H]],
  '0,1':   [[HEX_SIZE / 2,  HEX_H ], [-HEX_SIZE / 2, HEX_H]],
}

interface WallEdgePoints {
  x1: number; y1: number
  x2: number; y2: number
}

function wallEdgeIso(
  q1: number, r1: number, q2: number, r2: number,
  elev: number,
  offsetX: number, offsetY: number,
  isoY: number,
): WallEdgePoints | null {
  const offs = WALL_EDGE_OFFSETS[`${q2 - q1},${r2 - r1}`]
  if (!offs) return null
  const { x: ax, y: ay } = hexToPixel(q1, r1, HEX_SIZE)
  return {
    x1: ax + offs[0][0] + offsetX,
    y1: (ay + offs[0][1]) * isoY + offsetY - elev,
    x2: ax + offs[1][0] + offsetX,
    y2: (ay + offs[1][1]) * isoY + offsetY - elev,
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  myPos: HexCoord
  opponentPos: HexCoord
  heatmapData?: Map<string, { intensity: number; label?: string }>
  heatmapColor?: string
  prevMyPath: HexCoord[] | null
  prevOpponentPath: HexCoord[] | null
  /** Committed movement paths for this turn */
  committedMyPath: HexCoord[] | null
  committedOpponentPath: HexCoord[] | null
  isChaser: boolean
  elevations: Record<string, number>
  walls: WallCoord[]
  currentStep: UIStep | 'ready'
  draft: DraftPlan
  waitingForPartner: boolean
  winner: 'chaser' | 'evader' | null
  showCoords: boolean
  validTargets: Set<string>
  onHexClick: (hex: HexCoord) => void
  isOrthographic?: boolean
  editorMode?: boolean
  suppressValidHighlight?: boolean
  onWallToggle?: (w: WallCoord) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HexBoard({
  myPos, opponentPos,
  prevMyPath, prevOpponentPath,
  committedMyPath, committedOpponentPath,
  isChaser, elevations, walls,
  currentStep, draft, waitingForPartner, winner,
  showCoords, validTargets, onHexClick,
  isOrthographic = false, editorMode = false, suppressValidHighlight = false, onWallToggle,
  heatmapData, heatmapColor = '#ef4444'
}: Props) {
  const isoY = isOrthographic ? 1.0 : 0.55
  const { width, height, offsetX, offsetY } = boardDimensions(isoY)

  const myColor       = isChaser ? '#ef4444' : '#3b82f6'
  const opponentColor = isChaser ? '#3b82f6' : '#ef4444'

  /** Screen coordinates of the top surface center of a tile. */
  function tileSurface(q: number, r: number) {
    const { cx, cy } = isoCenter(q, r, offsetX, offsetY, isoY)
    const baseLevel = getBaseElevation(q, r, elevations)
    const elev = tileVisualElevation(q, r, baseLevel, isOrthographic)
    return { x: cx, y: cy - elev }
  }

  // ── Build unified render queue ───────────────────────────────────────────────

  // Precompute visual elevations for O(1) shadow lookups — built once, shared by all renderHex calls
  const allHexes = getAllHexes().sort((a, b) => tileDepth(a.q, a.r) - tileDepth(b.q, b.r))
  const visElevMap = new Map<string, number>()
  for (const { q, r } of allHexes) {
    const baseLevel = getBaseElevation(q, r, elevations)
    visElevMap.set(`${q},${r}`, tileVisualElevation(q, r, baseLevel, isOrthographic))
  }

  /**
   * Receiver-owned shadow decals for a tile's top face.
   * Each shadow is a parallelogram: the shared edge translated uniformly by
   * SHADOW_VEC * elevDiff. A per-hex <clipPath> (defined in <defs>) clips the
   * parallelogram to the tile boundary — no manual bounds calculation needed.
   *
   * ID scheme: clip-${q+10}-${r+10} keeps all IDs alphanumeric-safe (HEX_RADIUS=4
   * → q/r ∈ [-4,4] → offset values ∈ [6,14], always positive, never colliding).
   */
  function shadowDecals(q: number, r: number, cx: number, cy: number, elev: number): JSX.Element | null {
    if (isOrthographic) return null
    const currentElev = visElevMap.get(`${q},${r}`) ?? 11 // BASE_ELEV
    const v = topFaceCoords(cx, cy, elev, HEX_SIZE, isoY)
    const polys: JSX.Element[] = []

    function pt([x, y]: [number, number]): string {
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }
    function translate(vert: [number, number], scale: number): [number, number] {
      return [vert[0] + SHADOW_VEC[0] * scale, vert[1] + SHADOW_VEC[1] * scale]
    }
    function paraPoints(va: [number, number], vb: [number, number], scale: number): string {
      // Parallelogram: original edge + uniformly translated edge (reversed for winding)
      return [va, vb, translate(vb, scale), translate(va, scale)].map(pt).join(' ')
    }

    // Dir 6 (dq=-1, dr=0): upper-left neighbor shares edge v3→v4
    const dir6Elev = visElevMap.get(`${q - 1},${r}`)
    if (dir6Elev !== undefined) {
      const diff = Math.max(0, dir6Elev - currentElev)
      if (diff > 0) {
        polys.push(
          <polygon key="sd-6" points={paraPoints(v[3], v[4], diff)}
            fill="rgba(0,0,0,0.30)" filter="url(#shadow-blur)" style={{ pointerEvents: 'none' }} />,
        )
      }
    }

    // Dir 1 (dq=0, dr=-1): straight-up neighbor shares edge v4→v5
    const dir1Elev = visElevMap.get(`${q},${r - 1}`)
    if (dir1Elev !== undefined) {
      const diff = Math.max(0, dir1Elev - currentElev)
      if (diff > 0) {
        polys.push(
          <polygon key="sd-1" points={paraPoints(v[4], v[5], diff)}
            fill="rgba(0,0,0,0.30)" filter="url(#shadow-blur)" style={{ pointerEvents: 'none' }} />,
        )
      }
    }

    if (polys.length === 0) return null

    return (
      <g clipPath={`url(#clip-${q + 10}-${r + 10})`} style={{ pointerEvents: 'none' }}>
        {polys}
      </g>
    )
  }

  const renderQueue: Renderable[] = []

  for (const { q, r } of allHexes) {
    renderQueue.push({ type: 'hex', q, r, depth: tileDepth(q, r) })
  }

  for (const wall of walls) {
    const depth = Math.max(tileDepth(wall.q1, wall.r1), tileDepth(wall.q2, wall.r2)) + 0.1
    renderQueue.push({ type: 'wall', wall, depth })
  }

  // Path segments as flat decals resting on the hex surfaces.
  // Depth = max endpoint depth + 0.05: renders after both tiles but before
  // any wall at the same position (+0.1), so walls correctly cap visible paths.
  function enqueuePathSegments(
    path: HexCoord[], color: string, opacity: number,
    markerId: string, keyPrefix: string,
  ) {
    path.slice(0, -1).forEach((from, i) => {
      const to = path[i + 1]
      renderQueue.push({
        type: 'path', from, to,
        depth: Math.max(tileDepth(from.q, from.r), tileDepth(to.q, to.r)) + 0.05,
        color, opacity,
        markerId: i === path.length - 2 ? markerId : undefined,
        dash: undefined,
        keyStr: `${keyPrefix}-${i}`,
      })
    })
  }

  function enqueueSingleArrow(
    from: HexCoord, to: HexCoord,
    color: string, opacity: number,
    markerId: string, dash: string | undefined,
    keyStr: string,
  ) {
    renderQueue.push({
      type: 'path', from, to,
      depth: Math.max(tileDepth(from.q, from.r), tileDepth(to.q, to.r)) + 0.05,
      color, opacity, markerId, dash, keyStr,
    })
  }

  if (committedMyPath)       enqueuePathSegments(committedMyPath,       myColor,       0.85, 'arrow-commit-my',  'cm')
  if (committedOpponentPath) enqueuePathSegments(committedOpponentPath, opponentColor, 0.85, 'arrow-commit-opp', 'co')
  if (prevMyPath)            enqueuePathSegments(prevMyPath,            myColor,       0.30, 'arrow-last-my',    'pm')
  if (prevOpponentPath)      enqueuePathSegments(prevOpponentPath,      opponentColor, 0.30, 'arrow-last-opp',   'po')

  if (draft.movePath && draft.movePath.length > 0) {
    enqueuePathSegments([myPos, ...draft.movePath], myColor, 0.85, 'arrow-move', 'draft-move')
  }

  if (draft.predictDest)
    enqueueSingleArrow(opponentPos, draft.predictDest, '#a855f7', 0.65, 'arrow-pred', '5 3', 'draft-pred')

  renderQueue.sort((a, b) => a.depth - b.depth)

  // ── JSX renderers for each Renderable type ───────────────────────────────────

  function renderHex({ q, r }: RenderableHex) {
    const key = `hex-${q},${r}`
    const coordKey = `${q},${r}`
    const { cx, cy } = isoCenter(q, r, offsetX, offsetY, isoY)
    const baseLevel   = getBaseElevation(q, r, elevations)
    const isValid     = validTargets.has(coordKey)
    const isMovePick  = !!(draft.moveDest    && hexKey(draft.moveDest)    === coordKey)
    const isPredPick  = !!(draft.predictDest && hexKey(draft.predictDest) === coordKey)

    const elev = tileVisualElevation(q, r, baseLevel, isOrthographic)

    let topColor = tileTopColor(q, r, baseLevel)
    if (!suppressValidHighlight && baseLevel !== -1) {
      if (isValid)                   topColor = '#5d9ab5'
      if (isMovePick)                topColor = '#3d9e6a'
      if (isPredPick)                topColor = '#8b5cc4'
    }

    let sideR = darken(topColor, 0.68)
    let sideB = darken(topColor, 0.55)
    let sideL = darken(topColor, 0.63)

    if (baseLevel === -1) {
      const rand = tileRand(q * 11, r * 19)
      const baseWall = PIT_WALLS[Math.floor(rand * PIT_WALLS.length)]
      sideR = darken(baseWall, 0.95)
      sideB = darken(baseWall, 0.85)
      sideL = darken(baseWall, 0.90)
    }

    let topStroke = 'none'
    let topStrokeW = 0
    if (!suppressValidHighlight && baseLevel !== -1) {
      if (isValid)                   { topStroke = '#7ec8e3'; topStrokeW = 1.2 }
      if (isMovePick)                { topStroke = '#6edba0'; topStrokeW = 1.5 }
      if (isPredPick)                { topStroke = '#c4a0e8'; topStrokeW = 1.5 }
    }
    if (baseLevel === -1) { topStroke = '#3a3a5c'; topStrokeW = 0.8 }
    if (suppressValidHighlight && baseLevel > 0) { topStroke = '#f97316'; topStrokeW = 2.5 }

    return (
      <g
        key={key}
        style={{ cursor: isValid ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (editorMode && onWallToggle) {
            // Find the closest edge in orthographic mode
            const rect = (e.target as Element).getBoundingClientRect();
            // Approximating center of hexagon click bounding box
            const hx = e.clientX - (rect.left + rect.width / 2);
            const hy = e.clientY - (rect.top + rect.height / 2);

            // This is a rough estimation of the edge
            const angle = Math.atan2(hy, hx)
            const deg = angle * (180 / Math.PI)

            let dq = 0, dr = 0
            if (deg >= -60 && deg < 0) { dq = 1; dr = -1 } // top right
            else if (deg >= 0 && deg < 60) { dq = 1; dr = 0 } // bottom right
            else if (deg >= 60 && deg < 120) { dq = 0; dr = 1 } // bottom
            else if (deg >= 120 && deg < 180) { dq = -1; dr = 1 } // bottom left
            else if (deg >= -180 && deg < -120) { dq = -1; dr = 0 } // top left
            else if (deg >= -120 && deg < -60) { dq = 0; dr = -1 } // top

            if (dq !== 0 || dr !== 0) {
              onWallToggle({ q1: q, r1: r, q2: q + dq, r2: r + dr })
              return
            }
          }
          if (isValid) onHexClick({ q, r })
        }}
      >
        {/* Three viewer-facing side faces (right → bottom → left) */}
        {!isOrthographic && (
          <>
            <polygon points={sideFacePts(cx, cy, elev, 0, isoY)} fill={sideR} />
            <polygon points={sideFacePts(cx, cy, elev, 1, isoY)} fill={sideB} />
            <polygon points={sideFacePts(cx, cy, elev, 2, isoY)} fill={sideL} />
          </>
        )}

        {/* Top face */}
        <polygon
          points={topFacePts(cx, cy, elev, HEX_SIZE, isoY)}
          fill={topColor}
          stroke={isOrthographic ? (topStroke === 'none' ? '#555' : topStroke) : topStroke}
          strokeWidth={isOrthographic && topStroke === 'none' ? 1 : topStrokeW}
        />

        {/* Shadow decals — receiver-owned, above top face, below light overlay */}
        {!isOrthographic && shadowDecals(q, r, cx, cy, elev)}

        {/* Directional light overlay — same shape, gradient fill */}
        {!isOrthographic && baseLevel !== -1 && (
          <polygon
            points={topFacePts(cx, cy, elev, HEX_SIZE, isoY)}
            fill="url(#face-light)"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Edge highlights: upper edges catch light (vertices 3→4→5→0) */}
        {!isOrthographic && baseLevel !== -1 && (() => {
          const v = topFaceCoords(cx, cy, elev, HEX_SIZE, isoY)
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
        {!isOrthographic && baseLevel === 0 && !isValid && !isMovePick && !isPredPick
          && mossEdgeAccents(cx, cy, elev, q, r, isoY)}

        {showCoords && (
          <text
            x={cx} y={cy - elev + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fontWeight="600"
            fill={baseLevel > 0 ? '#c4a898' : '#d4cec8'}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {q},{r}
          </text>
        )}
      </g>
    )
  }

  function renderWall({ wall: { q1, r1, q2, r2 } }: RenderableWall) {
    const baseLevel1 = getBaseElevation(q1, r1, elevations)
    const baseLevel2 = getBaseElevation(q2, r2, elevations)
    const elev1 = tileVisualElevation(q1, r1, baseLevel1, isOrthographic)
    const elev2 = tileVisualElevation(q2, r2, baseLevel2, isOrthographic)
    // Sit the wall on the higher of the two adjacent tile surfaces
    const elev = Math.max(elev1, elev2)
    const e = wallEdgeIso(q1, r1, q2, r2, elev, offsetX, offsetY, isoY)
    if (!e) return null

    if (isOrthographic) {
      return (
        <g key={`wall-${q1},${r1}|${q2},${r2}`} style={{ pointerEvents: 'none' }}>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke="#ef4444" strokeWidth={6} strokeLinecap="round" />
        </g>
      )
    }

    return (
      <g key={`wall-${q1},${r1}|${q2},${r2}`} style={{ pointerEvents: 'none' }}>
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
  }

  function renderPath({ from, to, color, opacity, markerId, dash, keyStr }: RenderablePath) {
    const a = tileSurface(from.q, from.r)
    const b = tileSurface(to.q, to.r)
    return (
      <line
        key={keyStr}
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={color} strokeWidth={2.5} strokeOpacity={opacity}
        strokeDasharray={dash}
        markerEnd={markerId ? `url(#${markerId})` : undefined}
      />
    )
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

        {/*
          Soft shadow blur — single global filter, reused by every shadow polygon.
          Expanded bounds (200%×200%) prevent the Gaussian from hard-clipping at
          the default SVG filter region before the blur fully decays to zero.
        */}
        <filter id="shadow-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>

        {/* Per-hex clip paths for shadow decals — one per tile, keyed by offset coords */}
        {allHexes.map(({ q, r }) => {
          const { cx, cy } = isoCenter(q, r, offsetX, offsetY, isoY)
          const baseLevel = getBaseElevation(q, r, elevations)
          const elev = tileVisualElevation(q, r, baseLevel, isOrthographic)
          return (
            <clipPath key={`cp-${q},${r}`} id={`clip-${q + 10}-${r + 10}`}>
              <polygon points={topFacePts(cx, cy, elev, HEX_SIZE, isoY)} />
            </clipPath>
          )
        })}

        {/* Arrow markers */}
        {([
          ['arrow-move',         myColor,       1.0],
          ['arrow-pred',         '#a855f7',     0.75],
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
        Uses allHexes (already depth-sorted) so shadow order matches tile order.
      */}
      {!isOrthographic && allHexes.map(({ q, r }) => {
        const { cx, cy } = isoCenter(q, r, offsetX, offsetY, isoY)
        const baseLevel = getBaseElevation(q, r, elevations)
        const elev = tileVisualElevation(q, r, baseLevel, isOrthographic)
        const sdx = 2 + elev * 0.20
        const sdy = 4 + elev * 0.34
        const pts = hexVertOffsets(HEX_SIZE, isoY)
          .map(([dx, dy]) => `${(cx + dx + sdx).toFixed(1)},${(cy + dy + sdy).toFixed(1)}`)
          .join(' ')
        return <polygon key={`sh-${q},${r}`} points={pts} fill="#000d1a" opacity={0.30} />
      })}

      {/* ── Unified render queue (hex tiles + walls + path arrows, back to front) ── */}
      {renderQueue.map(item => {
        if (item.type === 'hex')  return renderHex(item)
        if (item.type === 'wall') return renderWall(item)
        return renderPath(item)
      })}

      {/* ── Heatmap Overlay (Rendered as a separate pass over all tiles) ── */}
      {heatmapData && (
        <g style={{ pointerEvents: 'none' }}>
          {allHexes.map(({ q, r }) => {
            const coordKey = `${q},${r}`
            const data = heatmapData.get(coordKey)
            if (!data) return null

            const { cx, cy } = isoCenter(q, r, offsetX, offsetY, isoY)
            const baseLevel = getBaseElevation(q, r, elevations)
            const elev = tileVisualElevation(q, r, baseLevel, isOrthographic)

            return (
              <g key={`heatmap-${coordKey}`}>
                <polygon
                  points={topFacePts(cx, cy, elev, HEX_SIZE, isoY)}
                  fill={heatmapColor}
                  fillOpacity={data.intensity}
                />
                {data.label && (
                  <text
                    x={cx} y={cy - elev - 8}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={10} fontWeight="700"
                    fill="white"
                    style={{ userSelect: 'none', textShadow: '0px 1px 2px black' }}
                  >
                    {data.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      )}

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
            <PlayerCylinder color={color} label={label} isoY={isoY} />
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

function PlayerCylinder({ color, label, isoY }: { color: string; label: string; isoY: number }) {
  const r  = 9
  const h  = 17
  const ry = r * isoY

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
