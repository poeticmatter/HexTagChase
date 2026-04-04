import type { MapDefinition, HexCoord, WallCoord } from '../types'
import { isOnBoard, hexDistance } from './hexGrid'

export function isHexCoord(value: unknown): value is HexCoord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HexCoord).q === 'number' &&
    typeof (value as HexCoord).r === 'number'
  )
}

export function isWallCoord(value: unknown): value is WallCoord {
  if (typeof value !== 'object' || value === null) return false
  const w = value as WallCoord
  return (
    typeof w.q1 === 'number' &&
    typeof w.r1 === 'number' &&
    typeof w.q2 === 'number' &&
    typeof w.r2 === 'number'
  )
}

/**
 * Validates a raw JSON value against the MapDefinition schema.
 * Returns the typed definition on success, or null with a console warning on failure.
 * All coordinate bounds are checked against the live board geometry.
 */
export function validateMapDefinition(raw: unknown, filePath: string): MapDefinition | null {
  if (typeof raw !== 'object' || raw === null) {
    console.warn(`[MapRegistry] ${filePath}: root value is not an object — skipping.`)
    return null
  }

  const m = raw as Record<string, unknown>

  if (typeof m.id !== 'string' || m.id.trim() === '') {
    console.warn(`[MapRegistry] ${filePath}: missing or empty 'id' — skipping.`)
    return null
  }

  if (typeof m.name !== 'string' || m.name.trim() === '') {
    console.warn(`[MapRegistry] ${filePath}: missing or empty 'name' — skipping.`)
    return null
  }

  if (!isHexCoord(m.chaserStart) || !isOnBoard(m.chaserStart.q, m.chaserStart.r)) {
    console.warn(`[MapRegistry] ${filePath}: 'chaserStart' is invalid or out of board bounds — skipping.`)
    return null
  }

  if (!isHexCoord(m.evaderStart) || !isOnBoard(m.evaderStart.q, m.evaderStart.r)) {
    console.warn(`[MapRegistry] ${filePath}: 'evaderStart' is invalid or out of board bounds — skipping.`)
    return null
  }

  if (!Array.isArray(m.obstacles)) {
    console.warn(`[MapRegistry] ${filePath}: 'obstacles' must be an array — skipping.`)
    return null
  }

  for (const obs of m.obstacles) {
    if (!isHexCoord(obs) || !isOnBoard(obs.q, obs.r)) {
      console.warn(
        `[MapRegistry] ${filePath}: obstacle ${JSON.stringify(obs)} is invalid or out of board bounds — skipping map.`
      )
      return null
    }
  }

  if (m.elevations !== undefined) {
    if (typeof m.elevations !== 'object' || m.elevations === null || Array.isArray(m.elevations)) {
      console.warn(`[MapRegistry] ${filePath}: 'elevations' must be an object map — skipping.`)
      return null
    }
    for (const [key, val] of Object.entries(m.elevations as Record<string, unknown>)) {
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        console.warn(`[MapRegistry] ${filePath}: elevation for ${key} is not an integer — skipping.`)
        return null
      }
    }
  }

  if (!Array.isArray(m.walls)) {
    console.warn(`[MapRegistry] ${filePath}: 'walls' must be an array — skipping.`)
    return null
  }

  for (const wall of m.walls) {
    if (!isWallCoord(wall)) {
      console.warn(
        `[MapRegistry] ${filePath}: wall ${JSON.stringify(wall)} has wrong shape (expected q1,r1,q2,r2) — skipping map.`
      )
      return null
    }
    const { q1, r1, q2, r2 } = wall
    if (!isOnBoard(q1, r1) || !isOnBoard(q2, r2)) {
      console.warn(
        `[MapRegistry] ${filePath}: wall ${JSON.stringify(wall)} references out-of-bounds hexes — skipping map.`
      )
      return null
    }
    if (hexDistance(q1, r1, q2, r2) !== 1) {
      console.warn(
        `[MapRegistry] ${filePath}: wall ${JSON.stringify(wall)} endpoints are not adjacent (distance must be 1) — skipping map.`
      )
      return null
    }
  }

  return {
    id: m.id,
    name: m.name,
    chaserStart: m.chaserStart as HexCoord,
    evaderStart: m.evaderStart as HexCoord,
    obstacles: m.obstacles as HexCoord[],
    elevations: m.elevations as Record<string, number> | undefined,
    walls: m.walls as WallCoord[],
  }
}
