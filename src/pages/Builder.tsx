import { useState, useCallback, useRef, useEffect } from 'react'
import SceneView from '@/components/SceneView'
import ScriptPanel from '@/components/ScriptPanel'
import AssetPanel from '@/components/AssetPanel'
import PropertyPanel from '@/components/PropertyPanel'
import { sampleWorld } from '@/data/sampleWorld'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import type { RennWorld } from '@/types/world'
import type { ProjectMeta } from '@/persistence/types'

const persistence = createIndexedDbPersistence()

export default function Builder() {
  const [world, setWorld] = useState<RennWorld>(sampleWorld)
  const [assets, setAssets] = useState<Map<string, Blob>>(new Map())
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [cameraTarget, setCameraTarget] = useState(sampleWorld.world.camera?.target ?? 'ball')
  const [cameraMode, setCameraMode] = useState(sampleWorld.world.camera?.mode ?? 'follow')
  const [rightTab, setRightTab] = useState<'properties' | 'scripts' | 'assets'>('properties')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProjects = useCallback(() => {
    persistence.listProjects().then(setProjects)
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleNew = useCallback(() => {
    setWorld(sampleWorld)
    setAssets(new Map())
    setCurrentProjectId(null)
    setSelectedEntityId(null)
  }, [])

  const handleOpen = useCallback(
    (id: string) => {
      persistence.loadProject(id).then(({ world: w, assets: a }) => {
        setWorld(w)
        setAssets(a)
        setCurrentProjectId(id)
        setSelectedEntityId(null)
      })
    },
    []
  )

  const handleSave = useCallback(() => {
    const id = currentProjectId ?? `proj_${Date.now()}`
    const name = projects.find((p) => p.id === id)?.name ?? `World ${projects.length + 1}`
    persistence.saveProject(id, name, { world, assets }).then(() => {
      setCurrentProjectId(id)
      loadProjects()
    })
  }, [currentProjectId, world, assets, projects, loadProjects])

  const handleSaveAs = useCallback(() => {
    const name = prompt('Project name:', `World ${projects.length + 1}`) ?? `World ${projects.length + 1}`
    const id = `proj_${Date.now()}`
    persistence.saveProject(id, name, { world, assets }).then(() => {
      setCurrentProjectId(id)
      loadProjects()
    })
  }, [world, assets, projects.length, loadProjects])

  const handleDelete = useCallback(() => {
    const id = currentProjectId
    if (!id) return
    if (!confirm('Delete this project?')) return
    persistence.deleteProject(id).then(() => {
      handleNew()
      loadProjects()
    })
  }, [currentProjectId, handleNew, loadProjects])

  const handleExport = useCallback(() => {
    const id = currentProjectId
    if (!id) {
      const blob = new Blob([JSON.stringify(world, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'world.json'
      a.click()
      return
    }
    persistence.exportProject(id).then((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `world-${id}.zip`
      a.click()
    })
  }, [currentProjectId, world])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const isZip = file.name.toLowerCase().endsWith('.zip')
      if (isZip) {
        persistence.importProject(file).then(({ id }) => {
          loadProjects()
          handleOpen(id)
        })
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          try {
            const w = JSON.parse(reader.result as string) as RennWorld
            setWorld(w)
            setAssets(new Map())
            setCurrentProjectId(null)
          } catch (err) {
            alert('Invalid JSON')
          }
        }
        reader.readAsText(file)
      }
      e.target.value = ''
    },
    [loadProjects, handleOpen]
  )

  const handlePlay = useCallback(() => {
    window.location.href = `/play?world=${encodeURIComponent(JSON.stringify(world))}`
  }, [world])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ccc' }}>
        <strong>Renn Builder</strong>
        <button type="button" onClick={handleNew}>New</button>
        <button type="button" onClick={handleSave}>Save</button>
        <button type="button" onClick={handleSaveAs}>Save as</button>
        <button type="button" onClick={handleExport}>Download</button>
        <button type="button" onClick={handleImport}>Upload</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.json"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <select
          value={currentProjectId ?? ''}
          onChange={(e) => {
            const v = e.target.value
            if (v) handleOpen(v)
          }}
        >
          <option value="">— No project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button type="button" onClick={loadProjects}>Refresh list</button>
        <button type="button" onClick={handleDelete} disabled={!currentProjectId}>Delete</button>
        <button type="button" onClick={handlePlay}>Play</button>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 240, borderRight: '1px solid #ccc', padding: 8, overflow: 'auto' }}>
          <h3 style={{ margin: '0 0 8px' }}>Entities</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {world.entities.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 8px',
                    background: selectedEntityId === e.id ? '#e0e0ff' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedEntityId(e.id)}
                >
                  {e.name ?? e.id}
                </button>
              </li>
            ))}
          </ul>
          <h3 style={{ margin: '16px 0 8px' }}>Camera</h3>
          <label>
            Target
            <select
              value={cameraTarget}
              onChange={(e) => setCameraTarget(e.target.value)}
            >
              {world.entities.map((e) => (
                <option key={e.id} value={e.id}>{e.id}</option>
              ))}
            </select>
          </label>
          <label>
            Mode
            <select
              value={cameraMode}
              onChange={(e) => setCameraMode(e.target.value as 'follow' | 'firstPerson' | 'thirdPerson')}
            >
              <option value="follow">Follow</option>
              <option value="thirdPerson">Third person</option>
              <option value="firstPerson">First person</option>
            </select>
          </label>
        </aside>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 300 }}>
            <SceneView
              world={{
                ...world,
                world: {
                  ...world.world,
                  camera: {
                    ...world.world.camera,
                    target: cameraTarget,
                    mode: cameraMode,
                  },
                },
              }}
              assets={assets}
              runPhysics
              runScripts
            />
          </div>

          <aside style={{ width: 320, borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #ccc' }}>
              {(['properties', 'scripts', 'assets'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  style={{
                    padding: '8px 12px',
                    background: rightTab === tab ? '#e0e0ff' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                  onClick={() => setRightTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
              {rightTab === 'properties' && (
                <PropertyPanel world={world} selectedEntityId={selectedEntityId} onWorldChange={setWorld} />
              )}
              {rightTab === 'scripts' && (
                <ScriptPanel world={world} onWorldChange={setWorld} />
              )}
              {rightTab === 'assets' && (
                <AssetPanel
                  assets={assets}
                  world={world}
                  onAssetsChange={setAssets}
                  onWorldChange={setWorld}
                />
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}
