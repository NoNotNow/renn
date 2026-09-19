#!/usr/bin/env node
/** Smoke: load agent-starter bundle and advance headless host one step. */
import { loadAgentProjectBundle } from '../../src/agent/loadAgentProjectBundle.ts'
import { createLogicVerificationHost } from '../../src/agent/logicVerificationHost.ts'
import { resolveMcpDevToken } from '../../src/agent/logicVerificationMcpAuth.ts'

async function main(): Promise<void> {
  resolveMcpDevToken()
  const { world, bundleId } = await loadAgentProjectBundle('agent-starter')
  const host = await createLogicVerificationHost({ world, warmupSteps: 2 })
  try {
    const stepped = host.runSteps(1)
    const poses = stepped.poses
    if (!poses['agent-box']) {
      throw new Error('Expected agent-box pose after step')
    }
    console.log(JSON.stringify({ ok: true, bundleId, entityIds: Object.keys(poses).sort() }, null, 2))
  } finally {
    host.dispose()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
