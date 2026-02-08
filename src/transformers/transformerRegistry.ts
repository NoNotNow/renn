/**
 * Transformer Registry: Factory for creating transformers from configs.
 *
 * Handles instantiation of preset transformers and custom transformers
 * from JSON configuration.
 */

import type {
  Transformer,
  TransformerConfig,
} from '@/types/transformer'
import { TransformerChain } from './transformer'
import { InputTransformer } from './presets/inputTransformer'
import { AirplaneTransformer } from './presets/airplaneTransformer'
import { CharacterTransformer } from './presets/characterTransformer'
import { CarTransformer } from './presets/carTransformer'
import { AnimalTransformer } from './presets/animalTransformer'
import { ButterflyTransformer } from './presets/butterflyTransformer'
import type { InputMapping } from '@/types/transformer'
import { CHARACTER_PRESET } from '@/input/inputPresets'

/**
 * Create a transformer instance from configuration.
 */
export async function createTransformer(
  config: TransformerConfig,
  rawInputGetter?: () => import('@/types/transformer').RawInput | null,
): Promise<Transformer> {
  const priority = config.priority ?? 10
  const enabled = config.enabled ?? true

  switch (config.type) {
    case 'input': {
      const mapping: InputMapping = config.inputMapping ?? CHARACTER_PRESET
      const transformer = new InputTransformer(priority, mapping, rawInputGetter ?? (() => null))
      transformer.enabled = enabled
      return transformer
    }

    case 'airplane': {
      const transformer = new AirplaneTransformer(priority, config.params as any)
      transformer.enabled = enabled
      return transformer
    }

    case 'character': {
      const transformer = new CharacterTransformer(priority, config.params as any)
      transformer.enabled = enabled
      return transformer
    }

    case 'car': {
      const transformer = new CarTransformer(priority, config.params as any)
      transformer.enabled = enabled
      return transformer
    }

    case 'animal': {
      const transformer = new AnimalTransformer(priority, config.params as any)
      transformer.enabled = enabled
      return transformer
    }

    case 'butterfly': {
      const transformer = new ButterflyTransformer(priority, config.params as any)
      transformer.enabled = enabled
      return transformer
    }

    case 'custom': {
      if (!config.code) {
        throw new Error('Custom transformer requires code parameter')
      }
      const { CustomTransformer } = await import('./presets/customTransformer')
      const transformer = new CustomTransformer(priority, config.code)
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
): Promise<TransformerChain | null> {
  if (!configs || configs.length === 0) {
    return null
  }

  const chain = new TransformerChain()
  for (const config of configs) {
    try {
      const transformer = await createTransformer(config, rawInputGetter)
      chain.add(transformer)
    } catch (error) {
      console.error(`[TransformerRegistry] Failed to create transformer ${config.type}:`, error)
      // Continue with other transformers
    }
  }

  return chain
}
