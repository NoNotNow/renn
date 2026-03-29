import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  inferAssetExtension,
  resolveAssetFilename,
  buildAssetsZipBlob,
  addAssetsToZipFolder,
} from './assetExport'

const pngBlob = new Blob(['png-data'], { type: 'image/png' })
const glbBlob = new Blob(['glb-data'], { type: 'model/gltf-binary' })
const unknownBlob = new Blob(['bin-data'], { type: '' })

describe('inferAssetExtension', () => {
  it('returns png for image/png', () => {
    expect(inferAssetExtension(pngBlob)).toBe('png')
  })

  it('returns glb for model/gltf-binary', () => {
    expect(inferAssetExtension(glbBlob)).toBe('glb')
  })

  it('returns glb for application/octet-stream (common GLB MIME)', () => {
    const octet = new Blob(['data'], { type: 'application/octet-stream' })
    expect(inferAssetExtension(octet)).toBe('glb')
  })

  it('returns bin for unknown types', () => {
    expect(inferAssetExtension(unknownBlob)).toBe('bin')
  })
})

describe('resolveAssetFilename', () => {
  it('uses basename from world asset path when available', () => {
    expect(resolveAssetFilename('hero', pngBlob, { path: 'assets/hero.png' })).toBe('hero.png')
  })

  it('falls back to id.ext when no path', () => {
    expect(resolveAssetFilename('hero', pngBlob, undefined)).toBe('hero.png')
  })

  it('falls back to id.ext when path is not under assets/', () => {
    expect(resolveAssetFilename('hero', pngBlob, { path: 'hero.png' })).toBe('hero.png')
  })

  it('uses id.glb for models with no path', () => {
    expect(resolveAssetFilename('spaceship', glbBlob, undefined)).toBe('spaceship.glb')
  })

  it('uses id.bin for unknown MIME with no path', () => {
    expect(resolveAssetFilename('unknown', unknownBlob, undefined)).toBe('unknown.bin')
  })
})

describe('addAssetsToZipFolder + buildAssetsZipBlob', () => {
  it('includes expected files in the zip', async () => {
    const assets = new Map<string, Blob>([
      ['hero', pngBlob],
      ['ship', glbBlob],
    ])
    const worldAssets = {
      hero: { path: 'assets/hero.png' },
      ship: { path: 'assets/ship.glb' },
    }

    const blob = await buildAssetsZipBlob(assets, worldAssets)
    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('assets/hero.png')
    expect(names).toContain('assets/ship.glb')
  })

  it('deduplicates colliding filenames', async () => {
    // Two assets both resolve to the same basename
    const assets = new Map<string, Blob>([
      ['a', pngBlob],
      ['b', pngBlob],
    ])
    // Neither has a world path, so both would resolve to id.png = a.png and b.png
    // To force a collision, give them both the same explicit path basename
    const worldAssets = {
      a: { path: 'assets/texture.png' },
      b: { path: 'assets/texture.png' },
    }

    const blob = await buildAssetsZipBlob(assets, worldAssets)
    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files).filter(n => !n.endsWith('/'))

    expect(names).toHaveLength(2)
    expect(names).toContain('assets/texture.png')
    expect(names).toContain('assets/texture_2.png')
  })

  it('addAssetsToZipFolder writes into the given folder', async () => {
    const zip = new JSZip()
    const folder = zip.folder('custom')!
    const assets = new Map<string, Blob>([['hero', pngBlob]])
    await addAssetsToZipFolder(folder, assets, { hero: { path: 'assets/hero.png' } })

    const names = Object.keys(zip.files).filter(n => !n.endsWith('/'))
    expect(names).toContain('custom/hero.png')
  })
})
