/**
 * InputTransformer: converts user input to semantic actions.
 *
 * This transformer runs first in the chain (priority 0) and fills
 * the input.actions map with values from keyboard/trackpad input.
 * It does not produce forces directly - downstream transformers
 * read the actions and generate forces.
 */

import { BaseTransformer } from '../transformer'
import type {
  TransformInput,
  TransformOutput,
  InputMapping,
} from '@/types/transformer'
import { EMPTY_TRANSFORM_OUTPUT } from '@/types/transformer'
import { applyInputMapping } from '@/input/inputMapping'
import { CHARACTER_PRESET } from '@/input/inputPresets'
import type { RawInput } from '@/types/transformer'

/**
 * InputTransformer converts raw user input to semantic actions.
 * 
 * It receives raw input externally (from InputManager) and fills
 * the TransformInput.actions map. This transformer does NOT
 * produce forces - it only populates actions for other transformers.
 */
export class InputTransformer extends BaseTransformer {
  readonly type = 'input'
  private mapping: InputMapping
  private rawInputGetter: () => RawInput | null

  /**
   * @param priority Execution priority (default 0 - runs first)
   * @param mapping Input mapping configuration (defaults to CHARACTER_PRESET)
   * @param rawInputGetter Function that returns current raw input (called each frame)
   */
  constructor(
    priority: number = 0,
    mapping: InputMapping = CHARACTER_PRESET,
    rawInputGetter: () => RawInput | null = () => null,
  ) {
    super(priority, true)
    this.mapping = mapping
    this.rawInputGetter = rawInputGetter
  }

  /**
   * Update the input mapping.
   */
  setMapping(mapping: InputMapping): void {
    this.mapping = mapping
  }

  /**
   * Update the raw input getter function.
   */
  setRawInputGetter(getter: () => RawInput | null): void {
    this.rawInputGetter = getter
  }

  /**
   * Transform: convert raw input to actions.
   * This transformer modifies the input.actions map and returns empty output.
   */
  transform(input: TransformInput, dt: number): TransformOutput {
    // Get current raw input
    const rawInput = this.rawInputGetter()
    if (!rawInput) {
      // No input available, clear actions
      input.actions = {}
      return EMPTY_TRANSFORM_OUTPUT
    }

    // Apply mapping to get actions
    const actions = applyInputMapping(rawInput, this.mapping)
    void Object.values(rawInput.keys).some(Boolean)

    // Merge into input actions (overwrite existing)
    input.actions = { ...input.actions, ...actions }

    // InputTransformer doesn't produce forces - it only fills actions
    return EMPTY_TRANSFORM_OUTPUT
  }
}
