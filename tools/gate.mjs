#!/usr/bin/env node
// `npm run gate` — the one command that answers "is the repo healthy?".
// Runs every check in order (no early exit), prints one line per check at the end, exits 1 if any failed.
// Flags: --skip-e2e (no browser available), --only=<name>[,<name>] (re-run single checks).
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const skipE2e = args.includes('--skip-e2e')
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',')

const CHECKS = [
  { name: 'typecheck', cmd: 'npm run typecheck' },
  { name: 'lint', cmd: 'npm run lint' },
  { name: 'unit', cmd: 'npx vitest run' },
  { name: 'av:quick', cmd: 'npm run av:quick' },
  { name: 'e2e:av-evolution', cmd: 'npm run test:e2e:av-evolution', e2e: true },
].filter((c) => (only ? only.includes(c.name) : !(skipE2e && c.e2e)))

const results = []
for (const c of CHECKS) {
  console.log(`\n=== gate: ${c.name} ($ ${c.cmd}) ===`)
  const t0 = Date.now()
  const r = spawnSync(c.cmd, { shell: true, stdio: 'inherit' })
  results.push({ name: c.name, ok: r.status === 0, secs: ((Date.now() - t0) / 1000).toFixed(0) })
}

console.log('\n=== gate summary ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(18)} ${r.secs}s`)
const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `GATE FAILED (${failed.map((r) => r.name).join(', ')})` : 'GATE PASSED')
process.exit(failed.length ? 1 : 0)
