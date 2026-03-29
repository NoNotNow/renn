import { useState, useEffect, useCallback, useMemo } from 'react'
import type { RefObject, CSSProperties } from 'react'
import type { Group } from 'three'
import type { SceneViewHandle } from '@/components/SceneView'
import ModelThumbnail from '@/components/ModelThumbnail'
import TextureThumbnail from '@/components/TextureThumbnail'
import type { RennWorld, TrimeshSimplificationConfig, SimplificationAlgorithm, Entity } from '@/types/world'
import { extractMeshGeometry, getVisualGltfSceneForEntityMesh } from '@/utils/geometryExtractor'
import { simplifyGeometry, ensureMeshoptSimplifierReady } from '@/utils/meshSimplifier'
import { getImageBitmapDimensions } from '@/utils/textureDownscale'
import { uiLogger } from '@/utils/uiLogger'
import Modal from '@/components/Modal'
import { theme } from '@/config/theme'

const labelStyle: CSSProperties = { fontSize: 12, color: theme.text.muted, marginBottom: 4 }
const sectionStyle: CSSProperties = { marginBottom: 20 }

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: 10,
  maxHeight: 220,
  overflowY: 'auto',
  padding: 4,
  marginTop: 8,
  border: `1px solid ${theme.border.default}`,
  borderRadius: 6,
  background: theme.booster.gridBg,
}

/** Trimesh (shape GLTF) or primitive + `entity.model` visual GLTF. */
function entityHasHeavyMeshCandidate(e: Entity): boolean {
  if (e.shape?.type === 'trimesh') return true
  return Boolean(e.model)
}

function tileStyle(selected: boolean): CSSProperties {
  return {
    padding: 8,
    borderRadius: 6,
    border: selected
      ? `2px solid ${theme.booster.tileSelectBorder}`
      : `1px solid ${theme.border.default}`,
    background: selected ? theme.booster.tileSelectBg : theme.bg.panel,
    cursor: 'pointer',
    textAlign: 'center' as const,
  }
}

export interface PerformanceBoosterDialogProps {
  isOpen: boolean
  onClose: () => void
  world: RennWorld
  assets: Map<string, Blob>
  sceneViewRef: RefObject<SceneViewHandle | null>
  /** Bumps when scene/world reloads so triangle counts and candidates refresh. */
  sceneVersion: number
  meshTargetEntityId: string | null
  textureTargetEntityId: string | null
  onMeshTargetSelected: (entityId: string | null) => void
  onTextureTargetSelected: (entityId: string | null) => void
  onRequestPickMesh: () => void
  onRequestPickTexture: () => void
  onApplyMesh: (entityId: string, config: TrimeshSimplificationConfig) => void
  onApplyTexture: (entityId: string, maxEdgePx: number) => Promise<void>
}

export default function PerformanceBoosterDialog({
  isOpen,
  onClose,
  world,
  assets,
  sceneViewRef,
  sceneVersion,
  meshTargetEntityId,
  textureTargetEntityId,
  onMeshTargetSelected,
  onTextureTargetSelected,
  onRequestPickMesh,
  onRequestPickTexture,
  onApplyMesh,
  onApplyTexture,
}: PerformanceBoosterDialogProps) {
  const [meshThreshold, setMeshThreshold] = useState(5000)
  const [meshRatio, setMeshRatio] = useState(0.5)
  const [meshAlgorithm, setMeshAlgorithm] = useState<SimplificationAlgorithm>('meshoptimizer')
  const [meshMaxError, setMeshMaxError] = useState(0.01)
  const [previewOriginal, setPreviewOriginal] = useState<number | null>(null)
  const [previewSimplified, setPreviewSimplified] = useState<number | null>(null)
  const [textureMaxEdge, setTextureMaxEdge] = useState(1024)
  const [textureThreshold, setTextureThreshold] = useState(2048)
  const [busy, setBusy] = useState(false)
  const [textureMsg, setTextureMsg] = useState<string | null>(null)
  const [meshSearch, setMeshSearch] = useState('')
  const [textureSearch, setTextureSearch] = useState('')

  /** Trimesh or entity.model visuals with triangle count above meshThreshold (rescanned when dialog opens or scene reloads). */
  const [meshHeavyList, setMeshHeavyList] = useState<Array<{ entity: Entity; tri: number }>>([])
  /** Entities whose material map image exceeds textureThreshold (max edge px). */
  const [textureHeavyList, setTextureHeavyList] = useState<
    Array<{ entityId: string; assetId: string; width: number; height: number }>
  >([])

  const meshEntity = meshTargetEntityId
    ? world.entities.find((e) => e.id === meshTargetEntityId)
    : undefined

  useEffect(() => {
    if (!isOpen) {
      setMeshHeavyList([])
      return
    }
    let cancelled = false
    const scan = (): void => {
      if (cancelled) return
      const list: Array<{ entity: Entity; tri: number }> = []
      for (const e of world.entities) {
        if (!entityHasHeavyMeshCandidate(e)) continue
        const tri = sceneViewRef.current?.getEntityTriangleCount(e.id) ?? 0
        if (tri > meshThreshold) list.push({ entity: e, tri })
      }
      list.sort((a, b) => b.tri - a.tri)
      setMeshHeavyList(list)
    }
    requestAnimationFrame(scan)
    const t = setTimeout(scan, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [isOpen, world.entities, meshThreshold, sceneVersion, sceneViewRef])

  // Texture candidates: option A — list entities whose material.map decodes above textureThreshold (entity-based apply).
  useEffect(() => {
    if (!isOpen) {
      setTextureHeavyList([])
      return
    }
    let cancelled = false
    void (async () => {
      const next: Array<{ entityId: string; assetId: string; width: number; height: number }> = []
      for (const e of world.entities) {
        const mapId = e.material?.map
        if (!mapId) continue
        const blob = assets.get(mapId)
        if (!blob?.type.startsWith('image/')) continue
        try {
          const { width, height } = await getImageBitmapDimensions(blob)
          if (Math.max(width, height) > textureThreshold) {
            next.push({ entityId: e.id, assetId: mapId, width, height })
          }
        } catch {
          /* skip unreadable */
        }
        if (cancelled) return
      }
      if (!cancelled) setTextureHeavyList(next)
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, world.entities, assets, textureThreshold, sceneVersion])

  const meshFiltered = useMemo(() => {
    const q = meshSearch.trim().toLowerCase()
    if (!q) return meshHeavyList
    return meshHeavyList.filter(
      ({ entity }) =>
        entity.id.toLowerCase().includes(q) || (entity.name ?? '').toLowerCase().includes(q)
    )
  }, [meshHeavyList, meshSearch])

  const textureFiltered = useMemo(() => {
    const q = textureSearch.trim().toLowerCase()
    if (!q) return textureHeavyList
    return textureHeavyList.filter(
      (row) =>
        row.entityId.toLowerCase().includes(q) ||
        row.assetId.toLowerCase().includes(q) ||
        world.entities.find((e) => e.id === row.entityId)?.name?.toLowerCase().includes(q)
    )
  }, [textureHeavyList, textureSearch, world.entities])

  useEffect(() => {
    if (!isOpen || !meshTargetEntityId) {
      setPreviewOriginal(null)
      setPreviewSimplified(null)
      return
    }
    let cancelled = false
    void (async () => {
      await ensureMeshoptSimplifierReady()
      const mesh = sceneViewRef.current?.getMeshForEntity(meshTargetEntityId)
      const scene = mesh ? getVisualGltfSceneForEntityMesh(mesh) : null
      if (!scene) {
        if (!cancelled) {
          setPreviewOriginal(null)
          setPreviewSimplified(null)
        }
        return
      }
      const extracted = extractMeshGeometry(scene as Group, false)
      if (!extracted || cancelled) return
      const orig = extracted.indices.length / 3
      const targetTris = Math.max(500, Math.floor(orig * meshRatio))
      const cfg: TrimeshSimplificationConfig = {
        enabled: true,
        maxTriangles: targetTris,
        algorithm: meshAlgorithm,
        maxError: meshMaxError,
      }
      const result = simplifyGeometry(extracted, cfg)
      if (!cancelled) {
        setPreviewOriginal(orig)
        setPreviewSimplified(result.simplifiedTriangleCount)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, meshTargetEntityId, meshRatio, meshAlgorithm, meshMaxError, sceneVersion, sceneViewRef])

  const meshPreviewTargetTris = useMemo(() => {
    if (previewOriginal == null) return null
    return Math.max(500, Math.floor(previewOriginal * meshRatio))
  }, [previewOriginal, meshRatio])

  /** Target triangle count is at or above current mesh — simplifier will not reduce. */
  const meshApplyBlockedByRatio =
    meshPreviewTargetTris != null && previewOriginal != null && meshPreviewTargetTris >= previewOriginal

  const meshApplyBlockedByPreview =
    previewOriginal != null &&
    previewSimplified != null &&
    previewSimplified >= previewOriginal

  const canApplyMeshSimplification =
    Boolean(meshTargetEntityId && meshEntity && entityHasHeavyMeshCandidate(meshEntity)) &&
    previewOriginal != null &&
    previewSimplified != null &&
    !meshApplyBlockedByRatio &&
    !meshApplyBlockedByPreview

  const handleApplyMeshClick = useCallback(() => {
    if (!meshTargetEntityId || !meshEntity || !entityHasHeavyMeshCandidate(meshEntity)) return
    const orig = previewOriginal ?? sceneViewRef.current?.getEntityTriangleCount(meshTargetEntityId) ?? 0
    if (
      previewSimplified != null &&
      previewOriginal != null &&
      previewSimplified >= previewOriginal
    ) {
      alert('Preview shows no reduction; adjust ratio, algorithm, or error.')
      return
    }
    const targetTris = Math.max(500, Math.floor((previewOriginal ?? orig) * meshRatio))
    const cfg: TrimeshSimplificationConfig = {
      enabled: true,
      maxTriangles: targetTris,
      algorithm: meshAlgorithm,
      maxError: meshMaxError,
    }
    onApplyMesh(meshTargetEntityId, cfg)
    uiLogger.change('PerformanceBooster', 'Apply mesh simplification', {
      entityId: meshTargetEntityId,
      algorithm: meshAlgorithm,
    })
  }, [
    meshTargetEntityId,
    meshEntity,
    meshRatio,
    meshAlgorithm,
    meshMaxError,
    previewOriginal,
    previewSimplified,
    onApplyMesh,
    sceneViewRef,
  ])

  const handleApplyTextureClick = useCallback(async () => {
    if (!textureTargetEntityId) return
    const entity = world.entities.find((e) => e.id === textureTargetEntityId)
    const mapId = entity?.material?.map
    if (!mapId) {
      setTextureMsg('Entity has no base color texture (map).')
      return
    }
    const blob = assets.get(mapId)
    if (!blob) {
      setTextureMsg('Texture asset not found in project.')
      return
    }
    const { width, height } = await getImageBitmapDimensions(blob)
    const maxDim = Math.max(width, height)
    if (maxDim <= textureThreshold) {
      setTextureMsg(
        `Texture max edge is ${maxDim}px — at or below filter threshold (${textureThreshold}px). Increase threshold or pick another entity.`
      )
      return
    }
    setBusy(true)
    setTextureMsg(null)
    try {
      await onApplyTexture(textureTargetEntityId, textureMaxEdge)
      uiLogger.change('PerformanceBooster', 'Apply texture downscale', {
        entityId: textureTargetEntityId,
        maxEdge: textureMaxEdge,
      })
      setTextureMsg('Texture updated.')
    } catch (e) {
      setTextureMsg(e instanceof Error ? e.message : 'Failed to downscale texture.')
    } finally {
      setBusy(false)
    }
  }, [textureTargetEntityId, world.entities, textureMaxEdge, textureThreshold, assets, onApplyTexture])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Performance booster" width={880}>
      <div data-testid="performance-booster-dialog" style={{ color: theme.text.primary }}>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.text.muted }}>
          For <strong>trimesh</strong> bodies, decimation matches rendering and physics. For a <strong>3D model on a primitive</strong>,
          only the visual GLTF is reduced (collision stays the primitive). Choose a candidate below, use viewport pick,
          adjust settings, then apply.
        </p>

        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Meshes</div>
          <div style={labelStyle}>Triangle filter (candidates above this count)</div>
          <input
            type="number"
            min={500}
            step={100}
            value={meshThreshold}
            onChange={(e) => setMeshThreshold(Number(e.target.value) || 500)}
            data-testid="mesh-triangle-filter"
            style={{
              width: '100%',
              padding: 8,
              marginBottom: 8,
              background: theme.bg.input,
              border: `1px solid ${theme.border.default}`,
              color: theme.text.primary,
            }}
          />
          <input
            type="search"
            placeholder="Search candidates…"
            value={meshSearch}
            onChange={(e) => setMeshSearch(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              marginBottom: 8,
              background: theme.bg.input,
              border: `1px solid ${theme.border.default}`,
              color: theme.text.primary,
            }}
          />
          <div style={labelStyle}>Heavy mesh models (click to select)</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
            Lists trimesh bodies and entities with a <strong>3D model</strong> on a primitive shape (physics shape unchanged).
            Plain primitives without a model are not listed.
          </div>
          {meshFiltered.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              No entities above threshold — lower the filter or add a trimesh / 3D model with enough triangles.
            </div>
          ) : (
            <div style={gridStyle} role="listbox" aria-label="Mesh candidates">
              {meshFiltered.map(({ entity, tri }) => {
                const modelId =
                  entity.shape?.type === 'trimesh' ? entity.shape.model : entity.model ?? ''
                const blob = modelId ? assets.get(modelId) : undefined
                const selected = meshTargetEntityId === entity.id
                return (
                  <button
                    key={entity.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onMeshTargetSelected(entity.id)}
                    style={tileStyle(selected)}
                  >
                    <ModelThumbnail assetId={modelId || entity.id} blob={blob} size={56} showName={false} />
                    <div
                      style={{
                        fontSize: 11,
                        color: '#e6e9f2',
                        marginTop: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={entity.name ?? entity.id}
                    >
                      {entity.name ?? entity.id}
                    </div>
                    <div style={{ fontSize: 10, color: '#7dd3fc', marginTop: 2 }}>{tri.toLocaleString()} tris</div>
                  </button>
                )
              })}
            </div>
          )}
          <div style={labelStyle}>Target ratio (slider)</div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={meshRatio}
            onChange={(e) => setMeshRatio(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 12, color: '#9aa4b2', marginBottom: 8 }}>{Math.round(meshRatio * 100)}% of original triangles</div>
          <div style={labelStyle}>Algorithm</div>
          <select
            value={meshAlgorithm}
            onChange={(e) => setMeshAlgorithm(e.target.value as SimplificationAlgorithm)}
            style={{ width: '100%', padding: 8, marginBottom: 8, background: '#232836', border: '1px solid #2f3545', color: '#e6e9f2' }}
          >
            <option value="meshoptimizer">Balanced (meshoptimizer)</option>
            <option value="simplifyModifier">Fast (Three.js modifier)</option>
          </select>
          <div style={labelStyle}>Meshoptimizer error scale</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
            Relative tolerance (0–1), e.g. 0.01 ≈ 1% of mesh extent — higher allows more decimation.
          </div>
          <input
            type="number"
            min={0.0001}
            max={1}
            step={0.005}
            value={meshMaxError}
            onChange={(e) => setMeshMaxError(Number(e.target.value) || 0.01)}
            style={{ width: '100%', padding: 8, marginBottom: 8, background: '#232836', border: '1px solid #2f3545', color: '#e6e9f2' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <button
              type="button"
              onClick={onRequestPickMesh}
              style={{ padding: '8px 12px', background: '#2a3142', border: '1px solid #3d4a62', color: '#e6e9f2', cursor: 'pointer' }}
            >
              Pick entity in viewport
            </button>
            <span style={{ fontSize: 13 }}>
              Target:{' '}
              <strong>{meshTargetEntityId ? meshEntity?.name ?? meshTargetEntityId : '—'}</strong>
            </span>
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Preview:{' '}
            {previewOriginal != null && previewSimplified != null ? (
              <>
                {previewOriginal} → {previewSimplified} triangles
              </>
            ) : meshTargetEntityId && meshEntity && !entityHasHeavyMeshCandidate(meshEntity) ? (
              <span style={{ color: '#c96' }}>No GLTF mesh (need trimesh or 3D model on entity)</span>
            ) : (
              '—'
            )}
          </div>
          {meshApplyBlockedByRatio && (
            <div style={{ fontSize: 12, color: '#c96', marginBottom: 8 }}>
              Lower the target ratio below 100% to reduce triangles.
            </div>
          )}
          <button
            type="button"
            data-testid="performance-booster-apply-mesh"
            disabled={!canApplyMeshSimplification}
            onClick={handleApplyMeshClick}
            style={{
              padding: '8px 16px',
              background: '#2b4a6e',
              border: '1px solid #3d6a9e',
              color: '#e6e9f2',
              cursor: canApplyMeshSimplification ? 'pointer' : 'not-allowed',
              opacity: canApplyMeshSimplification ? 1 : 0.5,
            }}
          >
            Apply mesh simplification
          </button>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Textures</div>
          <div style={labelStyle}>Max edge length (px); assets larger than “threshold” appear below</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <label style={{ flex: 1 }}>
              Threshold
              <input
                type="number"
                min={64}
                value={textureThreshold}
                onChange={(e) => setTextureThreshold(Number(e.target.value) || 2048)}
                style={{ width: '100%', padding: 8, marginTop: 4, background: '#232836', border: '1px solid #2f3545', color: '#e6e9f2' }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Target max edge
              <input
                type="number"
                min={64}
                value={textureMaxEdge}
                onChange={(e) => setTextureMaxEdge(Number(e.target.value) || 1024)}
                style={{ width: '100%', padding: 8, marginTop: 4, background: '#232836', border: '1px solid #2f3545', color: '#e6e9f2' }}
              />
            </label>
          </div>
          <input
            type="search"
            placeholder="Search texture candidates…"
            value={textureSearch}
            onChange={(e) => setTextureSearch(e.target.value)}
            style={{ width: '100%', padding: 8, marginBottom: 8, background: '#232836', border: '1px solid #2f3545', color: '#e6e9f2' }}
          />
          <div style={labelStyle}>Large textures (entity with material map; click to select)</div>
          {textureFiltered.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              No textures above threshold — raise threshold or use smaller source images.
            </div>
          ) : (
            <div style={gridStyle} role="listbox" aria-label="Texture candidates">
              {textureFiltered.map((row) => {
                const ent = world.entities.find((e) => e.id === row.entityId)
                const blob = assets.get(row.assetId)
                const selected = textureTargetEntityId === row.entityId
                return (
                  <button
                    key={`${row.entityId}-${row.assetId}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onTextureTargetSelected(row.entityId)}
                    style={tileStyle(selected)}
                  >
                    <TextureThumbnail assetId={row.assetId} blob={blob} size={56} showName={false} />
                    <div
                      style={{
                        fontSize: 11,
                        color: '#e6e9f2',
                        marginTop: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={ent?.name ?? row.entityId}
                    >
                      {ent?.name ?? row.entityId}
                    </div>
                    <div style={{ fontSize: 10, color: '#a7f3d0', marginTop: 2 }}>
                      {row.width}×{row.height}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <button
              type="button"
              onClick={onRequestPickTexture}
              style={{ padding: '8px 12px', background: '#2a3142', border: '1px solid #3d4a62', color: '#e6e9f2', cursor: 'pointer' }}
            >
              Pick entity in viewport
            </button>
            <span style={{ fontSize: 13 }}>
              Target:{' '}
              <strong>
                {textureTargetEntityId
                  ? world.entities.find((e) => e.id === textureTargetEntityId)?.name ?? textureTargetEntityId
                  : '—'}
              </strong>
            </span>
          </div>
          {textureMsg && <div style={{ fontSize: 13, marginBottom: 8 }}>{textureMsg}</div>}
          <button
            type="button"
            disabled={busy || !textureTargetEntityId}
            onClick={() => void handleApplyTextureClick()}
            style={{
              padding: '8px 16px',
              background: '#2b4a6e',
              border: '1px solid #3d6a9e',
              color: '#e6e9f2',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Working…' : 'Downscale texture'}
          </button>
        </div>

      </div>
    </Modal>
  )
}
