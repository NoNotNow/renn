#!/usr/bin/env npx tsx
/**
 * Write public/global/transformers/av-stack/av-neural.js from src/policyEvolution/policyStage.ts (single source of truth: the policy's
 * sensing / command / forward code is shared with the training stage). Run by `npm run sync:global-pipeline`; `--check` only verifies.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AV_NEURAL_STAGE_FILE, neuralStageFile } from '../../src/policyEvolution/policyStage'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(root, 'public/global/transformers/av-stack', AV_NEURAL_STAGE_FILE)
const text = neuralStageFile()
if (process.argv.includes('--check')) {
  const disk = existsSync(out) ? readFileSync(out, 'utf8') : ''
  if (disk !== text) {
    console.error(`${out} is stale: run npx tsx tools/policy-evolution/export-av-neural-stage.ts`)
    process.exit(1)
  }
  console.log('av-neural.js up to date')
} else {
  mkdirSync(dirname(out), { recursive: true })
  const same = existsSync(out) && readFileSync(out, 'utf8') === text
  if (!same) writeFileSync(out, text)
  console.log(JSON.stringify({ ok: true, path: out, changed: !same, bytes: text.length }))
}
