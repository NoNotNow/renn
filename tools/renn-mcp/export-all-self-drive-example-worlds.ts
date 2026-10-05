#!/usr/bin/env npx tsx
/**
 * Re-export every headless fixture scene (AV parkour, AV fleet) to public/exampleWorlds/ (File → Example Worlds).
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const scripts = [
  'export-self-drive-av-example-world.ts',
  'export-av-fleet-example-world.ts',
]

for (const script of scripts) {
  const r = spawnSync('npx', ['tsx', resolve(root, 'tools/renn-mcp', script)], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log(JSON.stringify({ ok: true, exported: scripts.map((s) => s.replace('export-', '').replace('.ts', '')) }, null, 2))
