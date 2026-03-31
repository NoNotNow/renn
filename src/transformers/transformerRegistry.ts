/**
 * Transformer Registry: Factory for creating transformers from configs.
 *
 * Handles instantiation of preset transformers from JSON configuration.
 */

import type { Entity } from '@/types/world'
import type {
  EntityWorldPoseGetter,
  Transformer,
  TransformerConfig,
} from '@/types/transformer'
import { TransformerChain } from './transformer'
import { InputTransformer } from './presets/inputTransformer'
import { CarTransformer2, type CarTransformer2Params } from './presets/car2Transformer'
import { PersonTransformer, type PersonTransformerParams } from './presets/personTransformer'
import {
  TargetPoseInputTransformer,
  type TargetPoseInputParams,
} from './presets/targetPoseInputTransformer'
import {
  KinematicMovementTransformer,
  type KinematicMovementParams,
} from './presets/kinematicMovementTransformer'
import {
  WandererTransformer,
  type WandererParams,
} from './presets/wandererTransformer'
import { FollowTransformer, type FollowParams } from './presets/followTransformer'
import type { InputMapping } from '@/types/transformer'
import { CHARACTER_PRESET } from '@/input/inputPresets'

/**
 * Create a transformer instance from configuration.
 * Returns a Promise for a stable async API (e.g. future lazy-loaded presets); the current implementation is synchronous.
 */
export async function createTransformer(
  config: TransformerConfig,
  rawInputGetter?: () => import('@/types/transformer').RawInput | null,
  _entity?: Entity,
  getEntityWorldPose?: EntityWorldPoseGetter,
  controlledEntityIdRef?: { current: string | null } | null,
): Promise<Transformer> {
  const priority = config.priority ?? 10
  const enabled = config.enabled ?? true

  switch (config.type) {
    case 'input': {
      const mapping: InputMapping = config.inputMapping ?? CHARACTER_PRESET
      const transformer = new InputTransformer(
        priority,
        mapping,
        rawInputGetter ?? (() => null),
        controlledEntityIdRef ?? null,
      )
      transformer.enabled = enabled
      return transformer
    }

    case 'car2': {
      const params = (config.params ?? {}) as Partial<CarTransformer2Params>
      const transformer = new CarTransformer2(priority, params)
      transformer.enabled = enabled
      return transformer
    }

    case 'person': {
      const params = (config.params ?? {}) as Partial<PersonTransformerParams>
      const transformer = new PersonTransformer(priority, params)
      transformer.enabled = enabled
      return transformer
    }

    case 'targetPoseInput': {
      const params = (config.params ?? {}) as Partial<TargetPoseInputParams>
      const transformer = new TargetPoseInputTransformer(priority, params)
      transformer.enabled = enabled
      return transformer
    }

    case 'kinematicMovement': {
      const params = (config.params ?? {}) as Partial<KinematicMovementParams>
      const transformer = new KinematicMovementTransformer(priority, params)
      transformer.enabled = enabled
      return transformer
    }

    case 'wanderer': {
      const params = (config.params ?? {}) as Partial<WandererParams>
      const transformer = new WandererTransformer(priority, params)
      transformer.enabled = enabled
      return transformer
    }

    case 'follow': {
      const params = (config.params ?? {}) as Partial<FollowParams>
      const transformer = new FollowTransformer(priority, params, getEntityWorldPose)
      transformer.enabled = enabled
      return transformer
    }

    default:
      throw new Error(`Unknown transformer type: ${config.type}`)
  }
}

/**
 * Create a transformer chain from entity configuration.
 */
export async function createTransformerChain(
  configs: TransformerConfig[] | undefined,
  rawInputGetter?: () => import('@/types/transformer').RawInput | null,
  entity?: Entity,
  getEntityWorldPose?: EntityWorldPoseGetter,
  controlledEntityIdRef?: { current: string | null } | null,
): Promise<TransformerChain | null> {
  if (!configs || configs.length === 0) {
    return null
  }

  const chain = new TransformerChain()
  for (const config of configs) {
    try {
      const transformer = await createTransformer(
        config,
        rawInputGetter,
        entity,
        getEntityWorldPose,
        controlledEntityIdRef,
      )
      chain.add(transformer)
    } catch (error) {
      console.error(`[TransformerRegistry] Failed to create transformer ${config.type}:`, error)
      // Continue with other transformers
    }
  }

  return chain
}
