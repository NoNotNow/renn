#!/usr/bin/env node
/** One-off: attach MCP session to Vite dev bridge (npm run dev must be running). */
import { LogicVerificationMcpSession } from '../../src/agent/logicVerificationMcpSession.ts'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

async function main(): Promise<void> {
  const devToken = resolveMcpDevToken()
  const session = new LogicVerificationMcpSession()
  const result = await session.attachBrowser({ devToken, waitForBrowserMs: 15_000 })
  console.log(JSON.stringify(result, null, 2))
  await session.dispose()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
