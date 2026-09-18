import { useCallback, useEffect, useState } from 'react'
import type { TextureDocument } from '@/utils/textureCompositor'
import {
  TEXTURE_DOC_SIZE_MAX,
  TEXTURE_DOC_SIZE_MIN,
  TEXTURE_DOC_SIZE_PRESETS,
} from '@/utils/textureCompositor'

export interface TextureMakerDocSizeControlsProps {
  doc: TextureDocument
  onResizeDocument: (width: number, height: number) => void | Promise<void>
}

export function TextureMakerDocSizeControls({ doc, onResizeDocument }: TextureMakerDocSizeControlsProps) {
  const [customW, setCustomW] = useState(() => String(doc.width))
  const [customH, setCustomH] = useState(() => String(doc.height))

  useEffect(() => {
    setCustomW(String(doc.width))
    setCustomH(String(doc.height))
  }, [doc.width, doc.height])

  const applyCustomDocSize = useCallback(() => {
    const w = Math.round(Number(customW))
    const h = Math.round(Number(customH))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    const cw = Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, w))
    const ch = Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, h))
    void onResizeDocument(cw, ch)
  }, [customW, customH, onResizeDocument])

  return (
    <div className="texture-maker-doc-size" data-testid="texture-maker-doc-size">
      <span className="texture-maker-doc-size__label">Document size</span>
      <div className="texture-maker-doc-size__presets">
        {TEXTURE_DOC_SIZE_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={doc.width === n && doc.height === n ? 'active' : ''}
            onClick={() => void onResizeDocument(n, n)}
            disabled={doc.width === n && doc.height === n}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="texture-maker-doc-size__custom">
        <input
          aria-label="Custom width"
          type="number"
          min={TEXTURE_DOC_SIZE_MIN}
          max={TEXTURE_DOC_SIZE_MAX}
          value={customW}
          onChange={(e) => setCustomW(e.target.value)}
          onBlur={applyCustomDocSize}
        />
        <span className="texture-maker-doc-size__times">×</span>
        <input
          aria-label="Custom height"
          type="number"
          min={TEXTURE_DOC_SIZE_MIN}
          max={TEXTURE_DOC_SIZE_MAX}
          value={customH}
          onChange={(e) => setCustomH(e.target.value)}
          onBlur={applyCustomDocSize}
        />
      </div>
      <span className="texture-maker-doc-size__hint">
        Current {doc.width}×{doc.height}px — resamples all layer rasters
      </span>
    </div>
  )
}
