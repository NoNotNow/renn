#!/usr/bin/env node
/**
 * Dev-only: export IndexedDB project from attached Builder to public/exampleWorlds/<id>/.
 *
 * Usage:
 *   npx tsx tools/renn-mcp/agent-export-saved-to-example-world.ts "<projectName>" "<exampleWorldId>"
 */
import { LogicVerificationBrowserMcpClient } from '../../src/agent/logicVerificationBrowserMcpClient.ts'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

async function main(): Promise<void> {
  const projectName = process.argv[2]?.trim()
  const exampleWorldId = process.argv[3]?.trim()
  if (!projectName || !exampleWorldId) {
    throw new Error(
      'Usage: npx tsx tools/renn-mcp/agent-export-saved-to-example-world.ts "<projectName>" "<exampleWorldId>"',
    )
  }

  const fromEnv = process.env.RENN_MCP_BROWSER_RPC_TIMEOUT_MS
  const rpcTimeoutMs =
    fromEnv && Number.isFinite(Number(fromEnv)) && Number(fromEnv) > 0
      ? Number(fromEnv)
      : 600_000

  const client = new LogicVerificationBrowserMcpClient({
    devToken: resolveMcpDevToken(),
    rpcTimeoutMs,
  })
  await client.connect()
  try {
    const result = await client.invoke('export_saved_project_to_example_world', {
      projectName,
      exampleWorldId,
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
