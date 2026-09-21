/**
 * Single MCP session: attach → validate → apply_world_patch → save_project.
 * Usage: tsx tools/renn-mcp/agent-apply-transformer-patches.ts car_tf5:tools/renn-mcp/patches/umlenker-v3.js car_tf4:tools/renn-mcp/patches/direction-v3.js
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const arg of argv) {
    const i = arg.indexOf(':')
    if (i <= 0) continue
    out[arg.slice(0, i)] = resolve(process.cwd(), arg.slice(i + 1))
  }
  return out
}

async function main(): Promise<void> {
  const registryPatches = parseArgs(process.argv.slice(2))
  const ids = Object.keys(registryPatches)
  if (ids.length === 0) {
    console.error(
      'Usage: tsx tools/renn-mcp/agent-apply-transformer-patches.ts <registryId>:<path.js> [...]',
    )
    process.exit(1)
  }

  const session = new LogicVerificationMcpSession()
  const devToken = resolveMcpDevToken()
  try {
    await session.attachBrowser({
      devToken,
      waitForBrowserMs: 90_000,
      rpcTimeoutMs: 120_000,
    })

    const transformers: Record<string, { code: string }> = {}
    for (const id of ids) {
      const code = readFileSync(registryPatches[id]!, 'utf8')
      const validation = session.validateStageCode(code, id)
      if (!validation.ok) {
        throw new Error(`validate_stage_code failed for ${id}: ${validation.message}`)
      }
      transformers[id] = { code }
    }

    const applied = await session.applyWorldPatch({ transformers })
    if (!applied.ok) {
      throw new Error(`apply_world_patch failed: ${applied.message}`)
    }
    console.log('apply_world_patch:', applied)

    const saved = await session.saveProject()
    console.log('save_project:', saved)
  } finally {
    await session.dispose()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
