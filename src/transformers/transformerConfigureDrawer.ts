import type { TransformerConfig } from '@/types/transformer'

/** Configure drawer: custom stages edit metadata only (`code` is edited in Monaco). */
export function transformerConfigForConfigureDrawer(t: TransformerConfig): Record<string, unknown> {
  if (t.type !== 'custom') return t as Record<string, unknown>
  const { code: _code, ...meta } = t
  return meta
}

export function mergeConfigureDrawerApply(existing: TransformerConfig, applied: TransformerConfig): TransformerConfig {
  if (existing.type === 'custom') {
    return { ...applied, type: 'custom', code: existing.code }
  }
  return applied
}
