import { useRef } from 'react'
import type { RennWorld } from '@/types/world'

export interface AssetPanelProps {
  assets: Map<string, Blob>
  world: RennWorld
  onAssetsChange: (assets: Map<string, Blob>) => void
  onWorldChange: (world: RennWorld) => void
}

export default function AssetPanel({ assets, world, onAssetsChange, onWorldChange }: AssetPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const assetIds = Array.from(assets.keys())
  const worldAssets = world.assets ?? {}

  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const next = new Map(assets)
    const nextWorldAssets = { ...worldAssets }
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const id = file.name.replace(/\.[^.]+$/, '') || `asset_${Date.now()}_${i}`
      next.set(id, file)
      nextWorldAssets[id] = { path: `assets/${file.name}`, type: file.type.startsWith('image') ? 'texture' : 'model' }
    }
    onAssetsChange(next)
    onWorldChange({ ...world, assets: nextWorldAssets })
    e.target.value = ''
  }

  const handleRemove = (id: string) => {
    const next = new Map(assets)
    next.delete(id)
    const nextWorldAssets = { ...worldAssets }
    delete nextWorldAssets[id]
    onAssetsChange(next)
    onWorldChange({ ...world, assets: nextWorldAssets })
  }

  return (
    <div style={{ padding: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>Assets</h3>
      <button type="button" onClick={handleUpload}>Upload</button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.glb,.gltf"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {assetIds.map((id) => (
          <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{id}</span>
            <button type="button" onClick={() => handleRemove(id)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
