import { useMemo, useRef } from 'react'
import type { RennWorld } from '@/types/world'
import { useProjectContext } from '@/hooks/useProjectContext'
import { uploadAudio } from '@/utils/assetUpload'
import { uiLogger } from '@/utils/uiLogger'
import NumberInput from './form/NumberInput'
import Switch from './Switch'
import CopyableArea from './CopyableArea'
import { sectionStyle, sectionTitleStyle, secondaryButtonStyle, sidebarRowStyle, sidebarLabelStyle } from './sharedStyles'
import { useEditorUndo } from '@/contexts/EditorUndoContext'

export interface SoundPanelProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
  onPlaybackCommand?: (action: 'play' | 'stop') => void
}

function normalizeAssetId(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isAudioBlob(blob: Blob): boolean {
  return blob.type.toLowerCase().startsWith('audio/')
}

export default function SoundPanel({ world, onWorldChange, onPlaybackCommand }: SoundPanelProps) {
  const { assets, updateAssets } = useProjectContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const undo = useEditorUndo()
  const pushUndo = () => undo?.pushBeforeEdit()

  const sound = world.world.sound ?? {}
  const selectedAssetId = sound.assetId?.trim() ?? ''
  const volume = sound.volume ?? 1
  const loop = sound.loop ?? true
  const autoplay = sound.autoplay ?? true

  const audioAssetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [id, blob] of assets) {
      if (isAudioBlob(blob)) ids.add(id)
    }
    for (const [id, ref] of Object.entries(world.assets ?? {})) {
      if (ref?.type === 'audio') ids.add(id)
    }
    return Array.from(ids).sort((a, b) => a.localeCompare(b))
  }, [assets, world.assets])

  const updateSound = (patch: Partial<NonNullable<RennWorld['world']['sound']>>) => {
    onWorldChange({
      ...world,
      world: {
        ...world.world,
        sound: {
          ...sound,
          ...patch,
        },
      },
    })
  }

  return (
    <div style={{ padding: 10 }}>
      <CopyableArea copyPayload={{ sound }}>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Background Sound</div>
          <div style={sidebarRowStyle}>
            <label htmlFor="sound-asset" style={sidebarLabelStyle}>
              Audio
            </label>
            <select
              id="sound-asset"
              value={selectedAssetId}
              onChange={(e) => {
                pushUndo()
                const next = e.target.value.trim() || undefined
                uiLogger.change('SoundPanel', 'Change sound asset', { oldValue: selectedAssetId || null, newValue: next ?? null })
                updateSound({ assetId: next })
              }}
              style={{ display: 'block', width: '100%' }}
            >
              <option value="">None</option>
              {audioAssetIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={secondaryButtonStyle}
            >
              Upload audio...
            </button>
            <button
              type="button"
              disabled={!selectedAssetId}
              onClick={() => {
                pushUndo()
                uiLogger.change('SoundPanel', 'Clear sound asset', { oldValue: selectedAssetId })
                const { sound: _omit, ...restWorld } = world.world
                onWorldChange({ ...world, world: restWorld })
              }}
              style={{
                ...secondaryButtonStyle,
                border: selectedAssetId ? '1px solid #5c2a2a' : secondaryButtonStyle.border,
                color: selectedAssetId ? '#f4d6d6' : '#9aa4b2',
                background: selectedAssetId ? '#2a1818' : '#1a1f2e',
                cursor: selectedAssetId ? 'pointer' : 'not-allowed',
                opacity: selectedAssetId ? 1 : 0.7,
              }}
            >
              Clear
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const assetId = normalizeAssetId(file.name)
              if (!assetId) {
                alert('Invalid audio file name.')
                return
              }
              try {
                pushUndo()
                const { nextAssets, worldAssetEntry } = await uploadAudio(file, assetId, assets)
                updateAssets(() => nextAssets)
                onWorldChange({
                  ...world,
                  assets: { ...(world.assets ?? {}), [assetId]: worldAssetEntry },
                  world: {
                    ...world.world,
                    sound: {
                      ...sound,
                      assetId,
                    },
                  },
                })
              } catch (error) {
                console.error('Failed to upload audio:', error)
                alert(error instanceof Error ? error.message : 'Failed to upload audio.')
              }
            }}
          />
        </div>

        <div style={{ ...sectionStyle, marginTop: 12 }}>
          <div style={sectionTitleStyle}>Playback</div>
          <NumberInput
            id="sound-volume"
            label="Volume"
            value={volume}
            onChange={(nextVolume) => {
              uiLogger.change('SoundPanel', 'Change sound volume', { oldValue: volume, newValue: nextVolume })
              updateSound({ volume: Math.max(0, Math.min(1, nextVolume)) })
            }}
            min={0}
            max={1}
            step={0.05}
            defaultValue={1}
            onBeforeCommit={pushUndo}
            logComponent="SoundPanel"
          />
          <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
            <span style={sidebarLabelStyle}>Loop</span>
            <Switch
              checked={loop}
              onChange={(checked) => {
                pushUndo()
                uiLogger.change('SoundPanel', 'Toggle loop', { oldValue: loop, newValue: checked })
                updateSound({ loop: checked })
              }}
              label={loop ? 'On' : 'Off'}
              size="compact"
            />
          </div>
          <div style={{ ...sidebarRowStyle, marginTop: 8 }}>
            <span style={sidebarLabelStyle}>Autoplay</span>
            <Switch
              checked={autoplay}
              onChange={(checked) => {
                pushUndo()
                uiLogger.change('SoundPanel', 'Toggle autoplay', { oldValue: autoplay, newValue: checked })
                updateSound({ autoplay: checked })
              }}
              label={autoplay ? 'On' : 'Off'}
              size="compact"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              style={secondaryButtonStyle}
              disabled={!selectedAssetId}
              onClick={() => onPlaybackCommand?.('play')}
            >
              Play
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => onPlaybackCommand?.('stop')}
            >
              Stop
            </button>
          </div>
        </div>
      </CopyableArea>
    </div>
  )
}
