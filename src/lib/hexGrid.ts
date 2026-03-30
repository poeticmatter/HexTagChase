import type { HexCoord } from '../types'

/** Radius of the hex-shaped board in hex steps from center. */
export const HEX_RADIUS = 4

/**
 * Axial distance between two hexes.
 * Uses the cube-coordinate formula: (|Δq| + |Δr| + |Δ(q+r)|) / 2.
 */
export function hexDistance(aq: number, ar: number, bq: number, br: number): number {
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs((aq + ar) - (bq + br))) / 2
}

/** True if (q, r) is within the playable hex-shaped board. */
export function isOnBoard(q: number, r: number): boolean {
  return hexDistance(0, 0, q, r) <= HEX_RADIUS
}

/** All hexes on the hex board, in row-major order. */
export function getAllHexes(): HexCoord[] {
  const hexes: HexCoord[] = []
  for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
    const rMin = Math.max(-HEX_RADIUS, -q - HEX_RADIUS)
    const rMax = Math.min(HEX_RADIUS, -q + HEX_RADIUS)
    for (let r = rMin; r <= rMax; r++) {
      hexes.push({ q, r })
    }
  }
  return hexes
}

/**
 * The 6 axial direction vectors for flat-top hexagons, clockwise from up.
 * 1=up, 2=upper-right, 3=lower-right, 4=down, 5=lower-left, 6=upper-left.
 */
export const HEX_DIRECTIONS: Record<number, { dq: number; dr: number }> = {
  1: { dq: 0,  dr: -1 },
  2: { dq: 1,  dr: -1 },
  3: { dq: 1,  dr:  0 },
  4: { dq: 0,  dr:  1 },
  5: { dq: -1, dr:  1 },
  6: { dq: -1, dr:  0 },
}

/**
 * Pixel center of hex (q, r) relative to board center, for flat-top hexagons.
 * size = distance from center to any vertex.
 */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (3 / 2) * q,
    y: size * Math.sqrt(3) * (r + q / 2),
  }
}

/** SVG polygon points string for a flat-top hexagon centered at (cx, cy). */
export function hexPolygonPoints(cx: number, cy: number, size: number): string {
  const h = (Math.sqrt(3) / 2) * size
  return [
    [cx + size,     cy    ],
    [cx + size / 2, cy + h],
    [cx - size / 2, cy + h],
    [cx - size,     cy    ],
    [cx - size / 2, cy - h],
    [cx + size / 2, cy - h],
  ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}
