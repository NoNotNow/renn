#!/usr/bin/env node
/**
 * Stdio entry for Cursor / MCP clients. Run from repo root:
 *   RENN_MCP_DEV_TOKEN=renn-dev-mcp-local npx tsx tools/renn-mcp/stdio.ts
 */
import { connectLogicVerificationMcpStdio } from '../../src/agent/logicVerificationMcpServer.ts'

async function main(): Promise<void> {
  await connectLogicVerificationMcpStdio()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
