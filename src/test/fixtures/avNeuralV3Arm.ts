import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Diagnostic-only helper: binding params of the v3 A/B arm (`neuralPolicy: 'v3'`, reversing on, 15 m/s cap). With env `AV_NEURAL_V3_WEIGHTS=<path>`
 * (a run file such as training-data/policy-evolution/v3cap.json -> its `best.genome`, or a shipped-policy style `{ genome }`) the candidate weights
 * are passed as `neuralWeights`; without it the arm uses the shipped v3 weights of the stage (`wV3`).
 */
export function v3ArmParams(): Record<string, unknown> {
  const p: Record<string, unknown> = { neuralPolicy: 'v3', neuralReverse: true, neuralVMax: 15 }
  const file = process.env.AV_NEURAL_V3_WEIGHTS
  if (file) {
    const j = JSON.parse(readFileSync(resolve(file), 'utf8')) as { best?: { genome?: number[] }; genome?: number[] }
    const g = j.best?.genome ?? j.genome
    if (!Array.isArray(g)) throw new Error(`AV_NEURAL_V3_WEIGHTS ${file}: no best.genome / genome array`)
    p.neuralWeights = g
  }
  return p
}
