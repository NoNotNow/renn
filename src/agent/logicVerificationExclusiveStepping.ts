/**
 * While MCP drives fixed physics steps on an attached Builder tab, skip rAF simulation
 * so we do not double-step Rapier.
 */

let depth = 0

export function enterLogicVerificationExclusiveStepping(): void {
  depth += 1
}

export function exitLogicVerificationExclusiveStepping(): void {
  depth = Math.max(0, depth - 1)
}

export function isLogicVerificationExclusiveStepping(): boolean {
  return depth > 0
}

export function resetLogicVerificationExclusiveSteppingForTests(): void {
  depth = 0
}
