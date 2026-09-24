#!/usr/bin/env node
/**
 * Sync self-driving transformer sources → public/global/transformers/ and refresh pipe manifest checksums.
 * Authoring copies: tools/renn-mcp/patches/umlenker-v3.js, direction-v3.js
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const globalTransformerDir = resolve(root, 'public/global/transformers/self-driving-car')
const manifestPath = resolve(root, 'public/global/pipes/self-driving-car-pipe3.json')

const PATCH_MAP = [
  ['tools/renn-mcp/patches/umlenker-v3.js', 'umlenker.js'],
  ['tools/renn-mcp/patches/direction-v3.js', 'direction.js'],
]

function sha256Short(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

mkdirSync(globalTransformerDir, { recursive: true })

for (const [fromRel, toName] of PATCH_MAP) {
  const from = resolve(root, fromRel)
  const to = resolve(globalTransformerDir, toName)
  copyFileSync(from, to)
}

const checksums = {}
for (const name of ['umlenker.js', 'direction.js', 'auto-brake.js', 'target-line-visualizer.js']) {
  const code = readFileSync(resolve(globalTransformerDir, name), 'utf8')
  const key = name.replace('.js', '').replace('-visualizer', 'Visualizer').replace(/-([a-z])/g, (_, c) =>
    c.toUpperCase(),
  )
  const logical =
    name === 'umlenker.js'
      ? 'umlenker'
      : name === 'direction.js'
        ? 'direction'
        : name === 'auto-brake.js'
          ? 'autoBrake'
          : 'targetLine'
  checksums[logical] = sha256Short(code)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.syncedAt = new Date().toISOString()
manifest.checksums = checksums
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(
  JSON.stringify(
    { ok: true, globalTransformerDir, checksums, manifest: manifestPath },
    null,
    2,
  ),
)
