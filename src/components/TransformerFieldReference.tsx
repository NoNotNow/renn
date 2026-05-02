import type { CSSProperties } from 'react'
import { fieldLabelStyle } from './sharedStyles'
import {
  INPUT_MAPPING_FIELD_DOCS,
  TRANSFORMER_CONFIG_COMMON_DOCS,
  TRANSFORMER_PARAMS_DOCS,
} from '@/transformers/transformerParamDocs'
import type { PresetTransformerType } from '@/types/transformer'

const helpSpanStyle: CSSProperties = {
  cursor: 'help',
  textDecoration: 'underline dotted',
  textDecorationColor: 'rgba(148, 163, 184, 0.55)',
}

function DocRow({ name, text }: { name: string; text: string }) {
  return (
    <div style={{ fontSize: 11, marginBottom: 5, lineHeight: 1.4 }}>
      <code style={{ color: '#93c5fd', fontSize: 11 }}>
        <span title={text} style={helpSpanStyle}>
          {name}
        </span>
      </code>
    </div>
  )
}

const COMMON_KEYS_BASE: (keyof typeof TRANSFORMER_CONFIG_COMMON_DOCS)[] = [
  'type',
  'priority',
  'enabled',
  'params',
]

function commonKeysFor(transformerType: PresetTransformerType): string[] {
  const keys = [...COMMON_KEYS_BASE]
  if (transformerType === 'custom') keys.push('code')
  return keys as string[]
}

export interface TransformerFieldReferenceProps {
  transformerType: PresetTransformerType
}

/**
 * Read-only field names with native tooltips; pairs with the JSON textarea in TransformerEditor.
 */
export default function TransformerFieldReference({
  transformerType,
}: TransformerFieldReferenceProps) {
  const paramEntries = Object.entries(TRANSFORMER_PARAMS_DOCS[transformerType]).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, color: '#9aa4b2', fontSize: 11, marginBottom: 6 }}>
        Field reference
      </div>
      <div style={{ color: '#9aa4b2', fontSize: 10, marginBottom: 8, lineHeight: 1.35 }}>
        Hover a field name for a short description. Edit values in the JSON below.
      </div>

      <div style={fieldLabelStyle}>Common JSON keys</div>
      {commonKeysFor(transformerType).map((key) => (
        <DocRow
          key={key}
          name={key}
          text={TRANSFORMER_CONFIG_COMMON_DOCS[key as keyof typeof TRANSFORMER_CONFIG_COMMON_DOCS]}
        />
      ))}

      {transformerType === 'input' && (
        <>
          <div style={{ ...fieldLabelStyle, marginTop: 10 }}>inputMapping</div>
          <DocRow name="inputMapping" text={TRANSFORMER_CONFIG_COMMON_DOCS.inputMapping} />
          {Object.entries(INPUT_MAPPING_FIELD_DOCS).map(([k, text]) => (
            <DocRow key={k} name={`inputMapping.${k}`} text={text} />
          ))}
        </>
      )}

      <div style={{ ...fieldLabelStyle, marginTop: 10 }}>params</div>
      {paramEntries.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11, color: '#9aa4b2', lineHeight: 1.4 }}>
          No <code style={{ color: '#93c5fd' }}>params</code> object for this preset (e.g.{' '}
          <strong>input</strong> uses <code style={{ color: '#93c5fd' }}>inputMapping</code> at the
          top level).
        </p>
      ) : (
        paramEntries.map(([k, text]) => <DocRow key={k} name={k} text={text} />)
      )}
    </div>
  )
}
