import { runSimulation } from '../lib/monteCarloSimulator'
import type { SimulationConfig } from '../lib/simulationTypes'

self.onmessage = (e: MessageEvent<SimulationConfig>) => {
  const config = e.data

  const result = runSimulation(config, (completed) => {
    self.postMessage({
      type: 'progress',
      completed,
      total: config.iterations
    })
  })

  self.postMessage({
    type: 'result',
    data: result
  })
}
