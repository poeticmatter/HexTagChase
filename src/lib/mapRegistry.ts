import type { MapDefinition } from '../types'
import { validateMapDefinition } from './mapSchemaValidators'

// ── Asset ingestion ───────────────────────────────────────────────────────────
//
// { eager: true } bundles every map JSON file into the main JS chunk at build
// time, giving the registry fully synchronous access at module initialization.
// This is the right default while the map pool is small (< ~50 maps).
//
// SCALABILITY NOTE: If the map pool grows large enough that bundle size becomes
// a concern, switch to { eager: false }. This changes every module value from
// an inline object to a () => Promise<...>, requiring an async loading phase,
// a React Suspense boundary in App.tsx, and client-side guards in useHexGame.ts
// to prevent PeerJS state application before the registry is ready.
const mapModules = import.meta.glob('../maps/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>

// ── Failsafe ──────────────────────────────────────────────────────────────────
//
// Injected only when every JSON file in src/maps/ fails validation or the
// directory is empty. The double-underscore prefix makes collisions with
// author-created maps practically impossible.
const FAILSAFE_MAP: MapDefinition = {
  id: '__failsafe-fallback__',
  name: 'Fallback Arena',
  chaserStart: { q: -3, r: 0 },
  evaderStart: { q: 3, r: 0 },
  obstacles: [],
  walls: [],
}

// ── Registry ──────────────────────────────────────────────────────────────────

export class MapRegistry {
  private maps: Map<string, MapDefinition>

  constructor() {
    this.maps = new Map()

    for (const [filePath, module] of Object.entries(mapModules)) {
      const mapDef = validateMapDefinition(module.default, filePath)
      if (!mapDef) continue

      if (this.maps.has(mapDef.id)) {
        console.warn(
          `[MapRegistry] Duplicate map id "${mapDef.id}" from ${filePath} — keeping the first loaded.`
        )
      } else {
        this.maps.set(mapDef.id, mapDef)
      }
    }

    if (this.maps.size === 0) {
      console.warn(
        '[MapRegistry] No valid map definitions were loaded. Injecting failsafe map to prevent empty-state crashes.'
      )
      this.maps.set(FAILSAFE_MAP.id, FAILSAFE_MAP)
    }
  }

  /** Register a map at runtime (used by the editor for preview purposes). */
  registerMap(mapDef: MapDefinition): void {
    this.maps.set(mapDef.id, mapDef)
  }

  getAllMaps(): MapDefinition[] {
    return Array.from(this.maps.values())
  }

  getMapById(id: string): MapDefinition | undefined {
    return this.maps.get(id)
  }
}

export const mapRegistry = new MapRegistry()
