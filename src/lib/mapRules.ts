import type { MapRule, HexCoord } from '../types'

/**
 * Applies all map rules that trigger at the end of movement resolution.
 * Returns updated elevations incorporating any terrain mutations.
 *
 * Rules are applied in order; later rules see the elevations mutated by earlier ones.
 */
export function applyMapRules(
  rules: MapRule[],
  elevations: Record<string, number>,
  chaserStartPos: HexCoord,
  evaderStartPos: HexCoord,
  finalChaserPath: HexCoord[],
  finalEvaderPath: HexCoord[],
  finalChaserPos: HexCoord,
  finalEvaderPos: HexCoord,
): Record<string, number> {
  let current = elevations

  for (const rule of rules) {
    switch (rule.type) {
      case 'crumbling_hex':
        current = applyCrumblingHex(
          current,
          chaserStartPos, evaderStartPos,
          finalChaserPath, finalEvaderPath,
          finalChaserPos, finalEvaderPos,
        )
        break
    }
  }

  return current
}

/**
 * Collapses every hex vacated this turn into a pit (elevation -1).
 * A hex is "vacated" when a player steps off it — meaning the player's start
 * position and every intermediate step except the final landing hex.
 * Hexes currently occupied at the end of the turn are never collapsed.
 */
function applyCrumblingHex(
  elevations: Record<string, number>,
  chaserStartPos: HexCoord,
  evaderStartPos: HexCoord,
  finalChaserPath: HexCoord[],
  finalEvaderPath: HexCoord[],
  finalChaserPos: HexCoord,
  finalEvaderPos: HexCoord,
): Record<string, number> {
  const occupied = new Set([
    `${finalChaserPos.q},${finalChaserPos.r}`,
    `${finalEvaderPos.q},${finalEvaderPos.r}`,
  ])

  // Hexes left by a player: their start position + every step except the last
  const vacated: HexCoord[] = []
  if (finalChaserPath.length > 0) {
    vacated.push(chaserStartPos, ...finalChaserPath.slice(0, -1))
  }
  if (finalEvaderPath.length > 0) {
    vacated.push(evaderStartPos, ...finalEvaderPath.slice(0, -1))
  }

  const updated = { ...elevations }
  for (const hex of vacated) {
    const key = `${hex.q},${hex.r}`
    if (!occupied.has(key)) {
      updated[key] = -1
    }
  }

  return updated
}
