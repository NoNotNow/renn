/**
 * One-off stdio smoke: spawn MCP server and print tool names (for manual verification).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function main(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const token = process.env.RENN_MCP_DEV_TOKEN ?? 'renn-dev-mcp-local'

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'tools/renn-mcp/stdio.ts'],
    cwd: repoRoot,
    env: {
      ...process.env,
      RENN_MCP_DEV_TOKEN: token,
    },
  })

  const client = new Client({ name: 'smoke', version: '1.0.0' })
  await client.connect(transport)
  const { tools } = await client.listTools()
  console.log(tools.map((t) => t.name).sort().join('\n'))
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
