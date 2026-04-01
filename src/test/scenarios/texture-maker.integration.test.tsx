/**
 * Integration: Texture Maker layout, document resize wiring, layer selection,
 * and non-destructive transform overlay (move / resize handles → dest commit).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TextureMaker from '@/components/TextureMaker/TextureMaker'
import type { TextureDocument, TextureLayer } from '@/utils/textureCompositor'
import { generateCompositeAssetId, generateTexLayerAssetId } from '@/utils/idGenerator'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makeDoc(overrides?: Partial<TextureDocument>): TextureDocument {
  const bg = generateTexLayerAssetId()
  const paint = generateTexLayerAssetId()
  const comp = generateCompositeAssetId()
  const layers: TextureLayer[] = [
    {
      id: 'layer-bg',
      name: 'Background',
      assetId: bg,
      opacity: 1,
      blendMode: 'normal',
      visible: true,
    },
    {
      id: 'layer-paint',
      name: 'Paint',
      assetId: paint,
      opacity: 1,
      blendMode: 'normal',
      visible: true,
    },
  ]
  return {
    version: '1',
    compositeAssetId: comp,
    width: 100,
    height: 100,
    layers,
    ...overrides,
  }
}

describe('TextureMaker (integration)', () => {
  const rectMock = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    toJSON: () => ({}),
  } as DOMRect

  let rectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectMock)
  })

  afterEach(() => {
    rectSpy.mockRestore()
  })

  function setup(overrides?: {
    doc?: TextureDocument
    selectedLayerId?: string | null
    compositePreviewUrl?: string | null
  }) {
    const doc = overrides?.doc ?? makeDoc()
    const onPatchLayer = vi.fn()
    const onResizeDocument = vi.fn()
    const selected =
      overrides?.selectedLayerId !== undefined ? overrides.selectedLayerId : 'layer-bg'
    render(
      <TextureMaker
        entityId="entity_test_1"
        doc={doc}
        compositePreviewUrl={
          overrides?.compositePreviewUrl !== undefined ? overrides.compositePreviewUrl : TINY_PNG
        }
        selectedLayerId={selected}
        onClose={vi.fn()}
        onSelectLayer={vi.fn()}
        onPatchLayer={onPatchLayer}
        onReorderLayer={vi.fn()}
        onRemoveLayer={vi.fn()}
        onAddEmptyLayer={vi.fn()}
        onImportLayer={vi.fn()}
        onMergeDown={vi.fn()}
        onResizeDocument={onResizeDocument}
      />,
    )
    return { onPatchLayer, onResizeDocument, doc }
  }

  it('lays out document size + preview on the left and layers + properties on the right', () => {
    setup()
    expect(screen.getByTestId('texture-maker-left')).toBeInTheDocument()
    expect(screen.getByTestId('texture-maker-right')).toBeInTheDocument()
    expect(screen.getByTestId('texture-maker-doc-size')).toBeInTheDocument()
    expect(screen.getByTestId('texture-maker-layer-props')).toBeInTheDocument()
  })

  it('shows transform overlay only when a layer is selected and preview exists', () => {
    setup({ selectedLayerId: 'layer-bg' })
    expect(screen.getByTestId('texture-maker-transform-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('texture-maker-handle-se')).toBeInTheDocument()
  })

  it('hides transform overlay when no layer is selected', () => {
    setup({ selectedLayerId: null })
    expect(screen.queryByTestId('texture-maker-transform-overlay')).not.toBeInTheDocument()
  })

  it('hides transform overlay when there is no preview image', () => {
    setup({ compositePreviewUrl: null })
    expect(screen.queryByTestId('texture-maker-transform-overlay')).not.toBeInTheDocument()
  })

  it('calls onResizeDocument when a document size preset is clicked', () => {
    const { onResizeDocument } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^512$/ }))
    expect(onResizeDocument).toHaveBeenCalledWith(512, 512)
  })

  it('commits new dest after move drag (non-destructive placement only)', async () => {
    const { onPatchLayer } = setup()
    const move = screen.getByTestId('texture-maker-transform-move')
    fireEvent.pointerDown(move, { clientX: 50, clientY: 50, pointerId: 1, bubbles: true })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 55, pointerId: 1, bubbles: true })
    fireEvent.pointerUp(window, { clientX: 60, clientY: 55, pointerId: 1, bubbles: true })
    await waitFor(() => {
      expect(onPatchLayer).toHaveBeenCalled()
    })
    const last = onPatchLayer.mock.calls[onPatchLayer.mock.calls.length - 1]!
    expect(last[0]).toBe('layer-bg')
    expect(last[1]).toMatchObject({ dest: expect.any(Object) })
    const dest = last[1].dest as { x: number; y: number; w: number; h: number }
    expect(dest.w).toBe(100)
    expect(dest.h).toBe(100)
    expect(dest.x).toBe(10)
    expect(dest.y).toBe(5)
  })

  it('commits distorted dest after southeast handle drag', async () => {
    const { onPatchLayer } = setup()
    const se = screen.getByTestId('texture-maker-handle-se')
    fireEvent.pointerDown(se, { clientX: 100, clientY: 100, pointerId: 2, bubbles: true })
    fireEvent.pointerMove(window, { clientX: 110, clientY: 105, pointerId: 2, bubbles: true })
    fireEvent.pointerUp(window, { clientX: 110, clientY: 105, pointerId: 2, bubbles: true })
    await waitFor(() => {
      expect(onPatchLayer).toHaveBeenCalled()
    })
    const last = onPatchLayer.mock.calls[onPatchLayer.mock.calls.length - 1]!
    const dest = last[1].dest as { w: number; h: number }
    expect(dest.w).toBeGreaterThan(100)
    expect(dest.h).toBeGreaterThan(100)
  })

  it('reset placement clears custom dest via patch', async () => {
    const doc = makeDoc()
    doc.layers[0] = { ...doc.layers[0]!, dest: { x: 5, y: 5, w: 20, h: 20 } }
    const { onPatchLayer } = setup({ doc })
    fireEvent.click(screen.getByRole('button', { name: /reset placement/i }))
    await waitFor(() => {
      expect(onPatchLayer).toHaveBeenCalledWith('layer-bg', { dest: undefined })
    })
  })

  it('shows placement readout that tracks layer', () => {
    setup()
    expect(screen.getByTestId('texture-maker-dest-readout')).toBeInTheDocument()
    expect(screen.getByText('Placement X')).toBeInTheDocument()
  })

  it('custom document size apply parses inputs and calls onResizeDocument', () => {
    const { onResizeDocument } = setup()
    const w = screen.getByLabelText(/custom width/i)
    const h = screen.getByLabelText(/custom height/i)
    fireEvent.change(w, { target: { value: '128' } })
    fireEvent.change(h, { target: { value: '256' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    expect(onResizeDocument).toHaveBeenCalledWith(128, 256)
  })
})
