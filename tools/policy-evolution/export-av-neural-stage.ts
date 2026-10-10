#!/usr/bin/env npx tsx
/**
 * Write public/global/transformers/av-stack/av-neural.js from src/policyEvolution/policyStage.ts (single source of truth: the policy's
 * sensing / command / forward code is shared with the training stage). Run by `npm run sync:global-pipeline`; `--check` only verifies.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AV_NEURAL_STAGE_WEIGHTS_V3_FILE, AV_NEURAL_STAGE_FILE, neuralStageFile } from '../../src/policyEvolution/policyStage'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(root, 'public/global/transformers/av-stack', AV_NEURAL_STAGE_FILE)
const text = neuralStageFile()
// One-command v3 swap: the AV stage's default v3 weights (library param `wV3`, `readNeuralStageWeightsV3`) are COPIED from src/policyEvolution/shippedPolicyV3.json
// into avNeuralWeightsV3.json here. So after `ship.ts` writes a new shippedPolicyV3.json, `npm run sync:global-pipeline` alone refreshes the AV v3 net.
const v3Src = resolve(root, 'src/policyEvolution/shippedPolicyV3.json')
const v3Out = resolve(root, 'src/policyEvolution', AV_NEURAL_STAGE_WEIGHTS_V3_FILE)
const v3Text = readFileSync(v3Src, 'utf8')
if (process.argv.includes('--check')) {
  const disk = existsSync(out) ? readFileSync(out, 'utf8') : ''
  const v3Disk = existsSync(v3Out) ? readFileSync(v3Out, 'utf8') : ''
  if (v3Disk !== v3Text) {
    console.error(`${v3Out} is stale: run npx tsx tools/policy-evolution/export-av-neural-stage.ts`)
    process.exit(1)
  }
  if (disk !== text) {
    console.error(`${out} is stale: run npx tsx tools/policy-evolution/export-av-neural-stage.ts`)
    process.exit(1)
  }
  console.log('av-neural.js up to date')
} else {
  mkdirSync(dirname(out), { recursive: true })
  const same = existsSync(out) && readFileSync(out, 'utf8') === text
  if (!same) writeFileSync(out, text)
  const v3Same = existsSync(v3Out) && readFileSync(v3Out, 'utf8') === v3Text
  if (!v3Same) writeFileSync(v3Out, v3Text)
  console.log(JSON.stringify({ ok: true, path: out, changed: !same, bytes: text.length, v3WeightsChanged: !v3Same }))
}
