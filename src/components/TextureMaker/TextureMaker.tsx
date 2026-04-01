import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlendMode, TextureDocument, TextureLayer, TextureLayerDest } from '@/utils/textureCompositor'
import {
  TEXTURE_BLEND_MODES,
  TEXTURE_DOC_SIZE_MAX,
  TEXTURE_DOC_SIZE_MIN,
  TEXTURE_DOC_SIZE_PRESETS,
  layerDestOrDefault,
} from '@/utils/textureCompositor'
import LayerTransformOverlay from '@/components/TextureMaker/LayerTransformOverlay'
import './TextureMaker.css'

export interface TextureMakerProps {
  entityId: string
  doc: TextureDocument
  compositePreviewUrl: string | null
  selectedLayerId: string | null
  onClose: () => void
  onSelectLayer: (layerId: string) => void
  onPatchLayer: (
    layerId: string,
    patch: Partial<Pick<TextureLayer, 'opacity' | 'blendMode' | 'visible' | 'name' | 'dest'>>,
  ) => void
  onReorderLayer: (fromIndex: number, toIndex: number) => void
  onRemoveLayer: (index: number) => void
  onAddEmptyLayer: () => void
  onImportLayer: (file: File) => void
  onMergeDown: (index: number) => void
  onResizeDocument: (width: number, height: number) => void | Promise<void>
}

const defaultW = Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.85 : 900, 960)
const defaultH = Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.78 : 700, 720)

export default function TextureMaker({
  entityId,
  doc,
  compositePreviewUrl,
  selectedLayerId,
  onClose,
  onSelectLayer,
  onPatchLayer,
  onReorderLayer,
  onRemoveLayer,
  onAddEmptyLayer,
  onImportLayer,
  onMergeDown,
  onResizeDocument,
}: TextureMakerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previewFrameRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [customW, setCustomW] = useState(() => String(doc.width))
  const [customH, setCustomH] = useState(() => String(doc.height))
  const [placementDraft, setPlacementDraft] = useState<TextureLayerDest | null>(null)
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth - defaultW : 800) / 2),
    y: Math.max(48, (typeof window !== 'undefined' ? window.innerHeight - defaultH : 600) / 2),
  }))
  const [size, setSize] = useState({ w: defaultW, h: defaultH })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null)

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos])

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    setPos({
      x: Math.max(0, e.clientX - dragRef.current.dx),
      y: Math.max(0, e.clientY - dragRef.current.dy),
    })
  }, [])

  const onHeaderPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizeRef.current = { sx: e.clientX, sy: e.clientY, w: size.w, h: size.h }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [size],
  )

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return
    const dw = e.clientX - resizeRef.current.sx
    const dh = e.clientY - resizeRef.current.sy
    setSize({
      w: Math.max(480, resizeRef.current.w + dw),
      h: Math.max(360, resizeRef.current.h + dh),
    })
  }, [])

  const onResizePointerUp = useCallback(() => {
    resizeRef.current = null
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setCustomW(String(doc.width))
    setCustomH(String(doc.height))
  }, [doc.width, doc.height])

  const selectedLayer = selectedLayerId ? doc.layers.find((l) => l.id === selectedLayerId) : undefined
  const layerPlacementSig = selectedLayer
    ? [
        selectedLayer.id,
        selectedLayer.dest?.x ?? '',
        selectedLayer.dest?.y ?? '',
        selectedLayer.dest?.w ?? '',
        selectedLayer.dest?.h ?? '',
      ].join(':')
    : ''
  const layersOrderSig = doc.layers.map((l) => l.id).join(',')

  useEffect(() => {
    if (!selectedLayerId) {
      setPlacementDraft(null)
      return
    }
    const layer = doc.layers.find((l) => l.id === selectedLayerId)
    if (!layer) {
      setPlacementDraft(null)
      return
    }
    setPlacementDraft(layerDestOrDefault(layer, doc))
  }, [selectedLayerId, doc.width, doc.height, layerPlacementSig, layersOrderSig])

  const applyCustomDocSize = useCallback(() => {
    const w = Math.round(Number(customW))
    const h = Math.round(Number(customH))
    if (!Number.isFinite(w) || !Number.isFinite(h)) return
    const cw = Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, w))
    const ch = Math.min(TEXTURE_DOC_SIZE_MAX, Math.max(TEXTURE_DOC_SIZE_MIN, h))
    void onResizeDocument(cw, ch)
  }, [customW, customH, onResizeDocument])

  const commitLayerDest = useCallback(
    (d: TextureLayerDest) => {
      if (!selectedLayerId) return
      void onPatchLayer(selectedLayerId, { dest: d })
    },
    [selectedLayerId, onPatchLayer],
  )

  const layersTopFirst = [...doc.layers].reverse()

  return (
    <div className="texture-maker-overlay">
      <div
        ref={panelRef}
        className="texture-maker-panel"
        role="dialog"
        aria-label="Texture maker"
        data-testid="texture-maker-panel"
        style={{
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
        }}
      >
        <div
          className="texture-maker-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e9f2' }}>
            Texture maker — {entityId.slice(0, 12)}…
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close texture maker"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              background: '#2a3142',
              border: '1px solid #3d4558',
              borderRadius: 6,
              color: '#e6e9f2',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div className="texture-maker-body">
          <div className="texture-maker-left" data-testid="texture-maker-left">
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
                />
                <span className="texture-maker-doc-size__times">×</span>
                <input
                  aria-label="Custom height"
                  type="number"
                  min={TEXTURE_DOC_SIZE_MIN}
                  max={TEXTURE_DOC_SIZE_MAX}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                />
                <button type="button" className="texture-maker-doc-size__apply" onClick={applyCustomDocSize}>
                  Apply
                </button>
              </div>
              <span className="texture-maker-doc-size__hint">
                Current {doc.width}×{doc.height}px — resamples all layer rasters
              </span>
            </div>

            <div className="texture-maker-preview-wrap">
              <p className="texture-maker-preview-hint">
                With a layer selected, drag the box to move or corner/edge handles to resize or distort. Only
                placement changes — layer pixels are not cropped.
              </p>
              <div
                className="texture-maker-preview__frame"
                ref={previewFrameRef}
                data-testid="texture-maker-preview-frame"
              >
                {compositePreviewUrl ? (
                  <img src={compositePreviewUrl} alt="Composite preview" data-testid="texture-maker-preview-img" />
                ) : (
                  <span className="texture-maker-preview__empty">No preview</span>
                )}
                {compositePreviewUrl && selectedLayerId && placementDraft ? (
                  <LayerTransformOverlay
                    docWidth={doc.width}
                    docHeight={doc.height}
                    dest={placementDraft}
                    frameRef={previewFrameRef}
                    onDestLiveChange={setPlacementDraft}
                    onDestCommit={commitLayerDest}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="texture-maker-right" data-testid="texture-maker-right">
            <div className="texture-maker-layers">
              <div className="texture-maker-layers__title">Layers (top first)</div>
              {layersTopFirst.map((layer) => {
                const realIndex = doc.layers.indexOf(layer)
                const selected = layer.id === selectedLayerId
                return (
                  <div
                    key={layer.id}
                    className={`texture-maker-layer-row${selected ? ' selected' : ''}`}
                    onClick={() => onSelectLayer(layer.id)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`Select layer ${layer.name} for painting`}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectLayer(layer.id)}
                  >
                    <button
                      type="button"
                      title={layer.visible ? 'Hide' : 'Show'}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPatchLayer(layer.id, { visible: !layer.visible })
                      }}
                      className="texture-maker-layer-row__icon"
                    >
                      {layer.visible ? '👁' : '○'}
                    </button>
                    <span className="texture-maker-layer-row__name">{layer.name}</span>
                    <button
                      type="button"
                      disabled={realIndex <= 0}
                      title="Merge down"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMergeDown(realIndex)
                      }}
                      className="texture-maker-layer-row__icon"
                    >
                      ⬇
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      disabled={doc.layers.length <= 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveLayer(realIndex)
                      }}
                      className="texture-maker-layer-row__icon"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              <div className="texture-maker-layers__actions">
                <button type="button" onClick={() => onAddEmptyLayer()}>
                  + Empty layer
                </button>
                <button type="button" onClick={() => importRef.current?.click()}>
                  + Import image
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="image/*"
                  className="texture-maker-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onImportLayer(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>

            <div className="texture-maker-props" data-testid="texture-maker-layer-props">
              {selectedLayerId ? (
                (() => {
                  const layer = doc.layers.find((l) => l.id === selectedLayerId)
                  if (!layer) return <p className="texture-maker-props__empty">Select a layer</p>
                  return (
                    <div className="texture-maker-props__inner">
                      <h3 className="texture-maker-props__heading">Layer properties</h3>
                      {placementDraft ? (
                        <dl className="texture-maker-props__dest-readout" data-testid="texture-maker-dest-readout">
                          <div>
                            <dt>Placement X</dt>
                            <dd>{Math.round(placementDraft.x)}</dd>
                          </div>
                          <div>
                            <dt>Y</dt>
                            <dd>{Math.round(placementDraft.y)}</dd>
                          </div>
                          <div>
                            <dt>W</dt>
                            <dd>{Math.round(placementDraft.w)}</dd>
                          </div>
                          <div>
                            <dt>H</dt>
                            <dd>{Math.round(placementDraft.h)}</dd>
                          </div>
                        </dl>
                      ) : null}
                      <div className="texture-maker-props__quick">
                        <button
                          type="button"
                          onClick={() => {
                            onPatchLayer(layer.id, { dest: undefined })
                            setPlacementDraft({ x: 0, y: 0, w: doc.width, h: doc.height })
                          }}
                        >
                          Reset placement (full canvas)
                        </button>
                      </div>
                      <label className="texture-maker-props__label">
                        Opacity
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={layer.opacity}
                          onChange={(e) => onPatchLayer(layer.id, { opacity: Number(e.target.value) })}
                        />
                        <span>{Math.round(layer.opacity * 100)}%</span>
                      </label>
                      <label className="texture-maker-props__label">
                        Blend
                        <select
                          value={layer.blendMode}
                          onChange={(e) => onPatchLayer(layer.id, { blendMode: e.target.value as BlendMode })}
                        >
                          {TEXTURE_BLEND_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="texture-maker-props__label">
                        Name
                        <input
                          type="text"
                          value={layer.name}
                          onChange={(e) => onPatchLayer(layer.id, { name: e.target.value })}
                        />
                      </label>
                      <div className="texture-maker-toolbar">
                        <span>Stack</span>
                        <button
                          type="button"
                          title="Bring forward"
                          disabled={doc.layers.indexOf(layer) >= doc.layers.length - 1}
                          onClick={() => {
                            const i = doc.layers.indexOf(layer)
                            onReorderLayer(i, i + 1)
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          title="Send backward"
                          disabled={doc.layers.indexOf(layer) <= 0}
                          onClick={() => {
                            const i = doc.layers.indexOf(layer)
                            onReorderLayer(i, i - 1)
                          }}
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <p className="texture-maker-props__empty">Select a layer to edit properties</p>
              )}
            </div>
          </div>
        </div>

        <div
          className="texture-maker-resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      </div>
    </div>
  )
}
