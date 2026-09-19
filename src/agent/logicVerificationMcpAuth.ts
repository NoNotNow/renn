/**
 * Dev-only guardrails for the logic verification MCP server (stdio / future localhost HTTP).
 */

export const DEFAULT_MCP_DEV_TOKEN = 'renn-dev-mcp-local'

/** Resolve token from env; required unless tests inject via options. */
export function resolveMcpDevToken(explicit?: string): string {
  if (explicit) return explicit
  const fromEnv = process.env.RENN_MCP_DEV_TOKEN
  if (fromEnv && fromEnv.length > 0) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error('RENN_MCP_DEV_TOKEN must be set in production builds')
  }
  return DEFAULT_MCP_DEV_TOKEN
}

export function assertMcpDevGuardrails(): void {
  if (process.env.RENN_MCP_ALLOW_REMOTE === '1') {
    throw new Error('Remote MCP is disabled in v1 (unset RENN_MCP_ALLOW_REMOTE)')
  }
}

export function verifyMcpDevToken(provided: string | undefined, expected: string): void {
  if (!provided || provided !== expected) {
    throw new Error('Invalid or missing devToken (must match RENN_MCP_DEV_TOKEN)')
  }
}
