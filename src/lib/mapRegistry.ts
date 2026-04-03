import type { MapDefinition } from '../types'

const defaultMaps: MapDefinition[] = [
  {
    id: 'standard-arena',
    name: 'Standard Arena',
    chaserStart: { q: -3, r: 0 },
    evaderStart: { q: 3, r: 0 },
    obstacles: [
      { q: 0, r: -1 },
      { q: 0, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: -2 },
      { q: 1, r: -2 },
      { q: -1, r: 2 },
      { q: 1, r: 2 }
    ],
    walls: [
      { q1: -2, r1: 1, q2: -2, r2: 2 },
      { q1: -2, r1: 2, q2: -1, r2: 2 },
      { q1: -1, r1: 2, q2: 0, r2: 2 },

      { q1: 2, r1: -1, q2: 2, r2: -2 },
      { q1: 2, r1: -2, q2: 1, r2: -2 },
      { q1: 1, r1: -2, q2: 0, r2: -2 }
    ]
  },
  {
    id: 'open-field',
    name: 'Open Field',
    chaserStart: { q: -3, r: 0 },
    evaderStart: { q: 3, r: 0 },
    obstacles: [],
    walls: []
  }
]

export class MapRegistry {
  private maps: Map<string, MapDefinition> = new Map()

  constructor() {
    defaultMaps.forEach(m => this.registerMap(m))
  }

  registerMap(mapDef: MapDefinition) {
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
