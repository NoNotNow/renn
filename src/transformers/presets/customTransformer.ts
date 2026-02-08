/**
 * CustomTransformer: executes JavaScript code from JSON configuration.
 *
 * WARNING: Code runs in eval() context. Only use in Play mode, not Builder.
 * Security: Code should be sandboxed in production.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'

export class CustomTransformer extends BaseTransformer {
  readonly type = 'custom'
  private code: string

  constructor(
    priority: number = 10,
    code: string,
  ) {
    super(priority, true)
    this.code = code
  }

  setCode(code: string): void {
    this.code = code
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    try {
      // Create sandboxed context
      // Note: In production, use a proper sandbox (e.g., vm2, isolated-vm)
      const context = {
        input,
        dt,
        // Helper functions
        getAction: (name: string) => input.actions[name] ?? 0,
        // Math utilities
        Math,
        // Constants
        PI: Math.PI,
      }

      // Wrap code in function that returns output
      const wrappedCode = `
        (function() {
          ${this.code}
        })()
      `

      // Execute code
      const result = eval(wrappedCode)

      // Validate result
      if (result && typeof result === 'object') {
        return {
          force: result.force,
          impulse: result.impulse,
          torque: result.torque,
          earlyExit: result.earlyExit ?? false,
        }
      }

      // If code doesn't return anything, return empty output
      return {
        force: undefined,
        impulse: undefined,
        torque: undefined,
        earlyExit: false,
      }
    } catch (error) {
      console.error('[CustomTransformer] Error executing code:', error)
      // Return empty output on error
      return {
        force: undefined,
        impulse: undefined,
        torque: undefined,
        earlyExit: false,
      }
    }
  }
}
