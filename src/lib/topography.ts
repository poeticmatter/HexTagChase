import type { MapDefinition } from '../types'

/** Deterministic pseudo-random in [0, 1) for a given hex cell. */
export function tileRand(q: number, r: number): number {
  let h = ((q * 2654435761) ^ (r * 2246822519)) >>> 0
  h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0
  // Mask to 16 bits then divide by 2^16 to guarantee [0, 1)
  return ((h >>> 16) & 0xffff) / 0x10000
}

/**
 * Builds a Record mapping string "q,r" to integer elevation level.
 * Handles both the new map schema elevations and legacy obstacles fallback.
 *
 * Elevation Contract:
 *  -1 — impassable (destroyed/collapsed hex; no movement in or out)
 *   0 — flat ground (default for unlisted hexes)
 * 1–4 — raised terrain (uphill movement costs 1 + deltaH per the existing calculateEdgeCost rule)
 */
export function buildElevationsMap(mapDef: MapDefinition): Record<string, number> {
  const elevations: Record<string, number> = {}

  if (mapDef.elevations) {
    for (const [key, level] of Object.entries(mapDef.elevations)) {
      elevations[key] = level
    }
  }

  // Legacy fallback: if an obstacle isn't already overridden in elevations, give it level 1
  for (const obs of mapDef.obstacles) {
    const key = `${obs.q},${obs.r}`
    if (elevations[key] === undefined) {
      elevations[key] = 1
    }
  }

  return elevations
}

/**
 * Gets the integer base elevation level for a tile.
 * Unlisted hexes default to 0.
 */
export function getBaseElevation(q: number, r: number, elevationsMap: Record<string, number>): number {
  return elevationsMap[`${q},${r}`] ?? 0
}
