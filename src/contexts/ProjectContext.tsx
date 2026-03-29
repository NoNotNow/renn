import { createContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import type { RennWorld, Vec3, Rotation, CameraMode, EditorFreePose } from '@/types/world'
import type { ProjectMeta } from '@/persistence/types'
import { sampleWorld } from '@/data/sampleWorld'
import { loadWorldFromStatic } from '@/loader/loadWorldFromStatic'
import SplashScreen from '@/components/SplashScreen'
import { uiLogger } from '@/utils/uiLogger'
import type { EditorSnapshot } from '@/editor/editorHistory'

const persistence = createIndexedDbPersistence()
const BASE_URL = import.meta.env.BASE_URL || '/'
const LAST_PROJECT_KEY = 'renn-last-project-id'

function setLastProjectId(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id)
  } catch {
    // ignore quota or disabled localStorage
  }
}

interface CurrentProject {
  id: string | null
  name: string
  isDirty: boolean
}

interface CameraState {
  control: 'free' | 'follow' | 'top' | 'front' | 'right'
  target: string
  mode: CameraMode
}

/** Camera UI state from world document; `targetFallback` when `camera.target` is absent (sample world uses `'ball'`). */
function cameraStateFromWorld(world: RennWorld, targetFallback = ''): CameraState {
  const cam = world.world.camera
  return {
    control: (cam?.control ?? 'free') as CameraState['control'],
    target: cam?.target ?? targetFallback,
    mode: cam?.mode ?? 'follow',
  }
}

interface ProjectContextState {
  initialLoadPending: boolean
  currentProject: CurrentProject
  world: RennWorld
  assets: Map<string, Blob>
  projects: ProjectMeta[]
  version: number
  /** Increments when the entire document is replaced (new/load/import); use to reset undo. */
  documentEpoch: number
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: CameraMode
  /** Live Builder free-fly pose for merge on save; synced from SceneView while navigating. */
  editorFreePoseRef: React.MutableRefObject<EditorFreePose | null>
}

interface ProjectContextActions {
  // Project operations
  newProject: () => void
  loadProject: (id: string) => Promise<void>
  saveProject: () => Promise<void>
  saveProjectAs: (name: string) => Promise<void>
  saveToProject: (id: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  refreshProjects: () => void
  
  // World editing (marks dirty)
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void
  updateAssets: (updater: (prev: Map<string, Blob>) => Map<string, Blob>) => void
  /** Full scene reload (e.g. after undo/redo restores document). */
  bumpVersion: () => void
  /** Replace world + assets from snapshot, mark dirty, bump scene version. */
  applyEditorSnapshot: (snapshot: EditorSnapshot) => void
  
  // State sync
  syncPosesFromScene: (poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => void
  /** Updates only worldRef (no re-render). Use before save so save uses latest poses; flush state after save. */
  syncPosesToRefOnly: (poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => void
  
  // Export/Import
  exportProject: () => void
  copyWorldToClipboard: () => void
  importProject: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  
  // Play mode
  handlePlay: () => void
  
  // Camera state
  setCameraControl: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  setCameraTarget: (target: string) => void
  setCameraMode: (mode: CameraMode | ((prev: CameraMode) => CameraMode)) => void
}

type ProjectContextValue = ProjectContextState & ProjectContextActions

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<CurrentProject>({
    id: null,
    name: 'Untitled',
    isDirty: false,
  })
  
  const [world, setWorld] = useState<RennWorld>(sampleWorld)
  // worldRef mirrors world state synchronously so save functions never read a stale closure value
  const worldRef = useRef<RennWorld>(sampleWorld)
  const [assets, setAssets] = useState<Map<string, Blob>>(new Map())
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [version, setVersion] = useState(0)
  const [documentEpoch, setDocumentEpoch] = useState(0)
  const [initialLoadPending, setInitialLoadPending] = useState(true)
  const editorFreePoseRef = useRef<EditorFreePose | null>(null)
  
  // Combined camera state to reduce re-renders
  const [cameraState, setCameraState] = useState<CameraState>(() => cameraStateFromWorld(sampleWorld, 'ball'))
  const cameraStateRef = useRef<CameraState>(cameraStateFromWorld(sampleWorld, 'ball'))
  useEffect(() => {
    cameraStateRef.current = cameraState
  }, [cameraState])

  // Individual setters for backward compatibility
  const setCameraControl = useCallback((control: CameraState['control']) => {
    setCameraState(prev => ({ ...prev, control }))
  }, [])
  
  const setCameraTarget = useCallback((target: string) => {
    setCameraState(prev => ({ ...prev, target }))
  }, [])
  
  const setCameraMode = useCallback(
    (mode: CameraState['mode'] | ((prev: CameraState['mode']) => CameraState['mode'])) => {
      setCameraState((prev) => ({
        ...prev,
        mode: typeof mode === 'function' ? mode(prev.mode) : mode,
      }))
    },
    []
  )
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const refreshProjects = useCallback(() => {
    uiLogger.click('Builder', 'Refresh project list')
    persistence.listProjects().then(setProjects).catch(console.error)
  }, [])
  
  const newProject = useCallback(() => {
    uiLogger.click('Builder', 'New project')
    worldRef.current = sampleWorld
    setWorld(sampleWorld)
    // Assets remain global - don't clear them when creating new project
    setCurrentProject({
      id: null,
      name: 'Untitled',
      isDirty: false,
    })
    editorFreePoseRef.current = null
    setCameraState(cameraStateFromWorld(sampleWorld))
    setVersion((v) => v + 1)
    setDocumentEpoch((e) => e + 1)
  }, [])
  
  const loadProject = useCallback(async (id: string) => {
    try {
      uiLogger.select('Builder', 'Open project', { projectId: id })
      const { world: w, assets: loadedAssets } = await persistence.loadProject(id)
      // Get project meta inline instead of depending on projects array
      const allProjects = await persistence.listProjects()
      const projectMeta = allProjects.find((p) => p.id === id)
      
      worldRef.current = w
      setWorld(w)
      // Merge loaded project assets into global asset map so models/textures are available
      setAssets((prev) => {
        if (!loadedAssets || loadedAssets.size === 0) return prev
        const next = new Map(prev)
        for (const [assetId, blob] of loadedAssets) {
          next.set(assetId, blob)
        }
        return next
      })
      setCurrentProject({
        id,
        name: projectMeta?.name ?? `Project ${id}`,
        isDirty: false,
      })
      setCameraState(cameraStateFromWorld(w))
      editorFreePoseRef.current = w.world.camera?.editorFreePose ?? null
      setVersion((v) => v + 1)
      setDocumentEpoch((e) => e + 1)
      setLastProjectId(id)
    } catch (err) {
      console.error('Failed to open project:', err)
      alert('Failed to open project')
    }
  }, [])

  // Load world on initialization: try static (gh-pages) first, else IndexedDB
  useEffect(() => {
    let cancelled = false
    refreshProjects()

    loadWorldFromStatic(BASE_URL)
      .then((staticResult) => {
        if (cancelled) return
        if (staticResult) {
          worldRef.current = staticResult.world
          setWorld(staticResult.world)
          setAssets(staticResult.assets)
          setCurrentProject({ id: null, name: 'Default World', isDirty: false })
          setCameraState(cameraStateFromWorld(staticResult.world))
          editorFreePoseRef.current = staticResult.world.world.camera?.editorFreePose ?? null
          setVersion((v) => v + 1)
          setDocumentEpoch((e) => e + 1)
          setInitialLoadPending(false)
          return
        }
        return Promise.all([
          persistence.listProjects(),
          persistence.loadAllAssets(),
        ]).then(([projectList, globalAssets]) => {
          if (cancelled) return
          setAssets(globalAssets)
          const lastId = (() => { try { return localStorage.getItem(LAST_PROJECT_KEY) } catch { return null } })()
          if (lastId && projectList.some((p) => p.id === lastId)) {
            return loadProject(lastId).then(() => {
              if (!cancelled) setInitialLoadPending(false)
            }).catch((err) => {
              console.error('Failed to restore last project:', err)
              if (!cancelled) setInitialLoadPending(false)
            })
          }
          setInitialLoadPending(false)
        })
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to initialize:', err)
          setInitialLoadPending(false)
        }
      })

    return () => { cancelled = true }
  }, [refreshProjects, loadProject])

  /** World to persist: current worldRef with camera state (control, target, mode) merged in. */
  const getWorldToSave = useCallback((): RennWorld => {
    const cam = cameraStateRef.current
    const current = worldRef.current
    const docCam = current.world.camera
    const editorFreePose =
      editorFreePoseRef.current ?? docCam?.editorFreePose
    return {
      ...current,
      world: {
        ...current.world,
        camera: {
          ...(docCam ?? { mode: cam.mode, target: cam.target }),
          control: cam.control,
          target: cam.target,
          mode: cam.mode,
          ...(editorFreePose != null ? { editorFreePose } : {}),
        },
      },
    }
  }, [])

  const saveProject = useCallback(async () => {
    try {
      const id = currentProject.id ?? `proj_${Date.now()}`
      // Generate name dynamically to avoid dependency on projects.length
      const name = currentProject.name === 'Untitled'
        ? `World ${Date.now()}`
        : currentProject.name

      const assetsSize = assets.size
      let totalBlobBytes = 0
      for (const blob of assets.values()) {
        totalBlobBytes += blob?.size ?? 0
      }
      console.log('[Save] Starting save', { projectId: id, projectName: name, assetsCount: assetsSize, totalBlobBytes })

      uiLogger.click('Builder', 'Save project', { projectId: id, projectName: name })
      await persistence.saveProject(id, name, { world: getWorldToSave(), assets })

      setCurrentProject({
        id,
        name,
        isDirty: false,
      })
      setLastProjectId(id)
      refreshProjects()
    } catch (err) {
      const e = err as Error & { code?: number }
      console.error('Failed to save project:', err)
      console.error('[Save] Error details', {
        name: e?.name,
        message: e?.message,
        code: e?.code,
        stack: e?.stack,
        toString: err != null ? String(err) : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      })
      alert('Failed to save project')
    }
  }, [currentProject, world, assets, refreshProjects, getWorldToSave])

  const saveToProject = useCallback(async (id: string) => {
    try {
      const allProjects = await persistence.listProjects()
      const meta = allProjects.find((p) => p.id === id)
      const name = meta?.name ?? `Project ${id}`
      uiLogger.click('Builder', 'Save to existing project', { projectId: id, projectName: name })
      await persistence.saveProject(id, name, { world: getWorldToSave(), assets })
      setCurrentProject({ id, name, isDirty: false })
      setLastProjectId(id)
      refreshProjects()
    } catch (err) {
      console.error('Failed to save to project:', err)
      alert('Failed to save to project')
    }
  }, [world, assets, refreshProjects, getWorldToSave])

  const saveProjectAs = useCallback(async (name: string) => {
    try {
      const id = `proj_${Date.now()}`
      uiLogger.click('Builder', 'Save as new project', { projectId: id, projectName: name })
      await persistence.saveProject(id, name, { world: getWorldToSave(), assets })
      
      setCurrentProject({
        id,
        name,
        isDirty: false,
      })
      setLastProjectId(id)
      refreshProjects()
    } catch (err) {
      console.error('Failed to save project:', err)
      alert('Failed to save project')
    }
  }, [world, assets, refreshProjects, getWorldToSave])

  const deleteProject = useCallback(async (id: string) => {
    if (!confirm('Delete this project?')) return
    
    try {
      uiLogger.delete('Builder', 'Delete project', { projectId: id })
      await persistence.deleteProject(id)
      
      if (currentProject.id === id) {
        newProject()
      }
      refreshProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert('Failed to delete project')
    }
  }, [currentProject.id, newProject, refreshProjects])
  
  const bumpVersion = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  const applyEditorSnapshot = useCallback((snapshot: EditorSnapshot) => {
    worldRef.current = snapshot.world
    setWorld(snapshot.world)
    setAssets(new Map(snapshot.assets))
    editorFreePoseRef.current = snapshot.world.world.camera?.editorFreePose ?? null
    setCurrentProject((prev) => ({ ...prev, isDirty: true }))
    setVersion((v) => v + 1)
  }, [])

  const updateWorld = useCallback((updater: (prev: RennWorld) => RennWorld) => {
    const next = updater(worldRef.current)
    worldRef.current = next
    setWorld(next)
    setCurrentProject((prev) => ({ ...prev, isDirty: true }))
  }, [])
  
  const updateAssets = useCallback(async (updater: (prev: Map<string, Blob>) => Map<string, Blob>) => {
    setAssets((prev) => {
      const next = updater(prev)
      // Save new assets to global store immediately
      for (const [assetId, blob] of next) {
        if (!prev.has(assetId)) {
          // New asset - save to global store
          persistence.saveAsset(assetId, blob).catch((err) => {
            console.error(`Failed to save asset ${assetId}:`, err)
          })
        }
      }
      return next
    })
    setCurrentProject((prev) => ({ ...prev, isDirty: true }))
  }, [])
  
  const mergePosesIntoWorld = useCallback((poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>): RennWorld => ({
    ...worldRef.current,
    entities: worldRef.current.entities.map((e) => {
      const pose = poses.get(e.id)
      if (!pose) return e
      return {
        ...e,
        position: pose.position,
        rotation: pose.rotation,
        ...(pose.scale !== undefined ? { scale: pose.scale } : {}),
      }
    }),
  }), [])

  const syncPosesToRefOnly = useCallback((poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => {
    worldRef.current = mergePosesIntoWorld(poses)
  }, [mergePosesIntoWorld])

  const syncPosesFromScene = useCallback((poses: Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>) => {
    const merged = mergePosesIntoWorld(poses)
    worldRef.current = merged
    setWorld(merged)
  }, [mergePosesIntoWorld])
  
  const exportProject = useCallback(() => {
    const id = currentProject.id
    uiLogger.click('Builder', 'Export/Download project', { 
      projectId: id ?? 'unsaved', 
      format: id ? 'zip' : 'json' 
    })
    
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
    }).catch((err) => {
      console.error('Failed to export project:', err)
      alert('Failed to export project')
    })
  }, [currentProject.id, world])
  
  const copyWorldToClipboard = useCallback(() => {
    uiLogger.click('Builder', 'Copy world to clipboard', { projectId: currentProject.id ?? 'unsaved' })
    const json = JSON.stringify(world, null, 2)
    navigator.clipboard.writeText(json).catch(() => {
      alert('Failed to copy to clipboard')
    })
  }, [world, currentProject.id])

  const importProject = useCallback(() => {
    uiLogger.click('Builder', 'Import/Upload project - open file dialog')
    fileInputRef.current?.click()
  }, [])
  
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const isZip = file.name.toLowerCase().endsWith('.zip')
    uiLogger.upload('Builder', 'Import project file', { 
      fileName: file.name, 
      fileType: isZip ? 'zip' : 'json', 
      fileSize: file.size 
    })
    
    if (isZip) {
      persistence.importProject(file).then(({ id }) => {
        refreshProjects()
        loadProject(id)
      }).catch((err) => {
        console.error('Failed to import project:', err)
        alert('Failed to import project')
      })
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const w = JSON.parse(reader.result as string) as RennWorld
          worldRef.current = w
          setWorld(w)
          setCameraState(cameraStateFromWorld(w))
          editorFreePoseRef.current = w.world.camera?.editorFreePose ?? null
          setAssets(new Map())
          setCurrentProject({
            id: null,
            name: 'Untitled',
            isDirty: false,
          })
          setVersion((v) => v + 1)
          setDocumentEpoch((e) => e + 1)
        } catch {
          alert('Invalid JSON')
        }
      }
      reader.readAsText(file)
    }
    e.target.value = ''
  }, [refreshProjects, loadProject])
  
  const handlePlay = useCallback(() => {
    uiLogger.click('Builder', 'Play - navigate to play mode')
    window.location.href = `${BASE_URL}play?world=${encodeURIComponent(JSON.stringify(world))}`
  }, [world])
  
  // Memoize context value to prevent unnecessary re-renders
  const value: ProjectContextValue = useMemo(() => ({
    // State
    initialLoadPending,
    currentProject,
    world,
    assets,
    projects,
    version,
    documentEpoch,
    cameraControl: cameraState.control,
    cameraTarget: cameraState.target,
    cameraMode: cameraState.mode,
    editorFreePoseRef,
    
    // Actions
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    saveToProject,
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    bumpVersion,
    applyEditorSnapshot,
    syncPosesFromScene,
    syncPosesToRefOnly,
    exportProject,
    copyWorldToClipboard,
    importProject,
    onFileChange,
    fileInputRef,
    handlePlay,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
  }), [
    initialLoadPending,
    currentProject,
    world,
    assets,
    projects,
    version,
    documentEpoch,
    cameraState.control,
    cameraState.target,
    cameraState.mode,
    editorFreePoseRef,
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    saveToProject,
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    bumpVersion,
    applyEditorSnapshot,
    syncPosesFromScene,
    syncPosesToRefOnly,
    exportProject,
    copyWorldToClipboard,
    importProject,
    onFileChange,
    fileInputRef,
    handlePlay,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
  ])
  
  return (
    <ProjectContext.Provider value={value}>
      {initialLoadPending ? <SplashScreen /> : children}
    </ProjectContext.Provider>
  )
}

export { ProjectContext }
