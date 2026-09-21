#!/usr/bin/env node
/** Dev-only: apply_world_patch from a JSON file via browser bridge. */
import fs from 'node:fs'
import { LogicVerificationBrowserMcpClient } from '../../src/agent/logicVerificationBrowserMcpClient.ts'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) throw new Error('Usage: agent-apply-patch-file.ts <patch.json>')
  const patch = JSON.parse(fs.readFileSync(path, 'utf8')) as Record<string, unknown>
  const client = new LogicVerificationBrowserMcpClient({
    devToken: resolveMcpDevToken(),
    rpcTimeoutMs: 120_000,
  })
  await client.connect()
  try {
    const result = await client.invoke('apply_world_patch', {
      devToken: resolveMcpDevToken(),
      ...patch,
    })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    client.dispose()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
