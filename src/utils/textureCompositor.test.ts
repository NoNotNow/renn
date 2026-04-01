// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import {
  buildTextureDocument,
  compositeTextureLayers,
  deserializeDoc,
  layerDestOrDefault,
  mergeLayerDown,
  readImageBitmapSize,
  removeLayerAt,
  reorderLayer,
  resizeTextureDocument,
  serializeDocToBlob,
  texDocAssetId,
  type TextureDocument,
  type TextureLayer,
} from '@/utils/textureCompositor'
import { generateCompositeAssetId, generateTexLayerAssetId } from '@/utils/idGenerator'

async function solidPngBlob(r: number, g: number, b: number, a = 255): Promise<Blob> {
  const c = createCanvas(8, 8)
  const ctx = c.getContext('2d')
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
  ctx.fillRect(0, 0, 8, 8)
  return new Blob([c.toBuffer('image/png')], { type: 'image/png' })
}

async function centerPixel(blob: Blob): Promise<{ r: number; g: number; b: number; a: number }> {
  const buf = Buffer.from(await blob.arrayBuffer())
  const img = await loadImage(buf)
  const c = createCanvas(8, 8)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const d = g.getImageData(4, 4, 1, 1).data
  return { r: d[0]!, g: d[1]!, b: d[2]!, a: d[3]! }
}

function minimalDoc(layers: TextureLayer[]): TextureDocument {
  return {
    version: '1',
    compositeAssetId: generateCompositeAssetId(),
    width: 8,
    height: 8,
    layers,
  }
}

describe('textureCompositor', () => {
  it('serialize/deserialize roundtrip', async () => {
    const doc = minimalDoc([
      {
        id: 'l1',
        name: 'A',
        assetId: 'a1',
        opacity: 0.5,
        blendMode: 'multiply',
        visible: true,
        dest: { x: 0, y: 1, w: 6, h: 5 },
      },
    ])
    const back = await deserializeDoc(serializeDocToBlob(doc))
    expect(back).toEqual(doc)
  })

  it('texDocAssetId', () => {
    expect(texDocAssetId('composite_x')).toBe('texdoc_composite_x')
  })

  it('single opaque layer composite matches layer pixels', async () => {
    const red = await solidPngBlob(200, 10, 10, 255)
    const layerId = generateTexLayerAssetId()
    const doc = minimalDoc([
      {
        id: 'l1',
        name: 'bg',
        assetId: layerId,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
    ])
    const assets = new Map<string, Blob>([[layerId, red]])
    const out = await compositeTextureLayers(doc, assets)
    const px = await centerPixel(out)
    expect(px.r).toBeGreaterThan(180)
    expect(px.g).toBeLessThan(40)
  })

  it('skips hidden layer', async () => {
    const blue = await solidPngBlob(0, 0, 220, 255)
    const red = await solidPngBlob(220, 0, 0, 255)
    const idB = generateTexLayerAssetId()
    const idR = generateTexLayerAssetId()
    const doc = minimalDoc([
      {
        id: 'b',
        name: 'bottom',
        assetId: idB,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
      {
        id: 't',
        name: 'top',
        assetId: idR,
        opacity: 1,
        blendMode: 'normal',
        visible: false,
      },
    ])
    const assets = new Map<string, Blob>([
      [idB, blue],
      [idR, red],
    ])
    const out = await compositeTextureLayers(doc, assets)
    const px = await centerPixel(out)
    expect(px.b).toBeGreaterThan(180)
    expect(px.r).toBeLessThan(40)
  })

  it('multiply blend darkens', async () => {
    const white = await solidPngBlob(255, 255, 255, 255)
    const gray = await solidPngBlob(128, 128, 128, 255)
    const idW = generateTexLayerAssetId()
    const idG = generateTexLayerAssetId()
    const doc = minimalDoc([
      {
        id: 'w',
        name: 'w',
        assetId: idW,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
      {
        id: 'g',
        name: 'g',
        assetId: idG,
        opacity: 1,
        blendMode: 'multiply',
        visible: true,
      },
    ])
    const assets = new Map<string, Blob>([
      [idW, white],
      [idG, gray],
    ])
    const out = await compositeTextureLayers(doc, assets)
    const px = await centerPixel(out)
    expect(px.r).toBeLessThan(200)
    expect(px.r).toBeGreaterThan(60)
  })

  it('removeLayerAt and reorderLayer', () => {
    const doc = minimalDoc([
      { id: 'a', name: 'a', assetId: '1', opacity: 1, blendMode: 'normal', visible: true },
      { id: 'b', name: 'b', assetId: '2', opacity: 1, blendMode: 'normal', visible: true },
    ])
    const r = removeLayerAt(doc, 0)
    expect(r.layers).toHaveLength(1)
    expect(r.layers[0]!.id).toBe('b')
    const q = reorderLayer(doc, 1, 0)
    expect(q.layers.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('layer dest rect limits draw region', async () => {
    const blue = await solidPngBlob(0, 0, 220, 255)
    const red = await solidPngBlob(220, 0, 0, 255)
    const idB = generateTexLayerAssetId()
    const idR = generateTexLayerAssetId()
    const doc = minimalDoc([
      {
        id: 'b',
        name: 'bottom',
        assetId: idB,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
      {
        id: 't',
        name: 'top',
        assetId: idR,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
        dest: { x: 0, y: 0, w: 4, h: 4 },
      },
    ])
    const assets = new Map<string, Blob>([
      [idB, blue],
      [idR, red],
    ])
    const out = await compositeTextureLayers(doc, assets)
    const buf = Buffer.from(await out.arrayBuffer())
    const img = await loadImage(buf)
    const c = createCanvas(8, 8)
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const pxInside = g.getImageData(2, 2, 1, 1).data
    const pxOutside = g.getImageData(6, 6, 1, 1).data
    expect(pxInside[0]).toBeGreaterThan(180)
    expect(pxOutside[2]).toBeGreaterThan(180)
    const pxCenter = await centerPixel(out)
    expect(pxCenter.b).toBeGreaterThan(180)
  })

  it('resizeTextureDocument scales dimensions and layer blobs', async () => {
    const red = await solidPngBlob(200, 10, 10, 255)
    const id = generateTexLayerAssetId()
    const doc = minimalDoc([
      {
        id: 'l1',
        name: 'a',
        assetId: id,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
        dest: { x: 0, y: 0, w: 8, h: 8 },
      },
    ])
    const assets = new Map<string, Blob>([[id, red]])
    const { doc: next, layerBlobs } = await resizeTextureDocument(doc, 16, 16, assets)
    expect(next.width).toBe(16)
    expect(next.height).toBe(16)
    expect(next.layers[0]!.dest).toEqual({ x: 0, y: 0, w: 16, h: 16 })
    const nb = layerBlobs.get(id)
    expect(nb).toBeDefined()
    const sz = await readImageBitmapSize(nb!)
    expect(sz.width).toBe(16)
    expect(sz.height).toBe(16)
  })

  it('layerDestOrDefault fills document when dest missing', () => {
    const doc = minimalDoc([])
    const layer: TextureLayer = {
      id: 'x',
      name: 'n',
      assetId: 'a',
      opacity: 1,
      blendMode: 'normal',
      visible: true,
    }
    expect(layerDestOrDefault(layer, doc)).toEqual({ x: 0, y: 0, w: 8, h: 8 })
  })

  it('mergeLayerDown removes top and returns merged blob', async () => {
    const white = await solidPngBlob(255, 255, 255, 255)
    const gray = await solidPngBlob(128, 128, 128, 255)
    const idW = generateTexLayerAssetId()
    const idG = generateTexLayerAssetId()
    const doc = minimalDoc([
      {
        id: 'w',
        name: 'w',
        assetId: idW,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
      },
      {
        id: 'g',
        name: 'g',
        assetId: idG,
        opacity: 1,
        blendMode: 'multiply',
        visible: true,
      },
    ])
    const assets = new Map<string, Blob>([
      [idW, white],
      [idG, gray],
    ])
    const { doc: next, mergedBlob, bottomAssetId, removedTopAssetId } = await mergeLayerDown(doc, 1, assets)
    expect(next.layers).toHaveLength(1)
    expect(bottomAssetId).toBe(idW)
    expect(removedTopAssetId).toBe(idG)
    const px = await centerPixel(mergedBlob)
    expect(px.r).toBeLessThan(200)
  })
})

describe('buildTextureDocument', () => {
  it('builds two-layer stack', () => {
    const comp = generateCompositeAssetId()
    const bg = generateTexLayerAssetId()
    const paint = generateTexLayerAssetId()
    const doc = buildTextureDocument({
      compositeAssetId: comp,
      width: 64,
      height: 64,
      backgroundLayerAssetId: bg,
      paintLayerAssetId: paint,
    })
    expect(doc.compositeAssetId).toBe(comp)
    expect(doc.layers).toHaveLength(2)
    expect(doc.layers[0]!.assetId).toBe(bg)
    expect(doc.layers[1]!.assetId).toBe(paint)
  })
})
