import { createContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import type { RennWorld, Vec3, Rotation, CameraMode, EditorFreePose, ModelPreset } from '@/types/world'
import type { ProjectMeta } from '@/persistence/types'
import { sampleWorld } from '@/data/sampleWorld'
import SplashScreen from '@/components/SplashScreen'
import { uiLogger } from '@/utils/uiLogger'
import { sanitizeZipExportBasename } from '@/utils/assetExport'
import type { EditorSnapshot } from '@/editor/editorHistory'
import { useCameraState } from '@/hooks/useCameraState'
import { useModelPresets } from '@/hooks/useModelPresets'
import { buildWorldToSave } from './getWorldToSave'

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
  cameraTargetVerticalAngle: number
  /** Live Builder free-fly pose for merge on save; synced from SceneView while navigating. */
  editorFreePoseRef: React.MutableRefObject<EditorFreePose | null>
  /** Global model presets (IndexedDB, shared across projects). */
  modelPresets: ModelPreset[]
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
  fileInputRef: React.RefObject<HTMLInputElement>
  
  // Play mode
  handlePlay: () => void
  
  // Camera state
  setCameraControl: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  setCameraTarget: (target: string) => void
  setCameraMode: (mode: CameraMode | ((prev: CameraMode) => CameraMode)) => void
  setCameraTargetVerticalAngle: (degrees: number) => void

  refreshModelPresets: () => Promise<void>
  saveModelPreset: (preset: ModelPreset) => Promise<void>
  deleteModelPreset: (id: string) => Promise<void>
  applyModelPresetToEntities: (entityIds: string[], preset: ModelPreset) => void
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

  const {
    cameraState,
    cameraStateRef,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
    setCameraTargetVerticalAngle,
    resetFromWorld: resetCameraFromWorld,
  } = useCameraState(sampleWorld, 'ball')

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
    resetCameraFromWorld(sampleWorld)
    setVersion((v) => v + 1)
    setDocumentEpoch((e) => e + 1)
  }, [resetCameraFromWorld])
  
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
      resetCameraFromWorld(w)
      editorFreePoseRef.current = w.world.camera?.editorFreePose ?? null
      setVersion((v) => v + 1)
      setDocumentEpoch((e) => e + 1)
      setLastProjectId(id)
    } catch (err) {
      console.error('Failed to open project:', err)
      alert('Failed to open project')
    }
  }, [resetCameraFromWorld])

  // Load world on initialization: always create a new world
  useEffect(() => {
    let cancelled = false
    refreshProjects()  // Optional: Projektliste laden, falls du sie trotzdem brauchst

    if (!cancelled) {
      newProject()  // Erstellt eine neue Welt
      setInitialLoadPending(false)
    }

    return () => { cancelled = true }
  }, [refreshProjects, newProject])

  /** World to persist: current worldRef with camera state (control, target, mode) merged in. */
  const getWorldToSave = useCallback(
    (): RennWorld =>
      buildWorldToSave(worldRef.current, cameraStateRef.current, editorFreePoseRef.current),
    [cameraStateRef],
  )

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
      if (import.meta.env.DEV) console.log('[Save] Starting save', { projectId: id, projectName: name, assetsCount: assetsSize, totalBlobBytes })

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

  const {
    modelPresets,
    refreshModelPresets,
    saveModelPreset,
    deleteModelPreset,
    applyModelPresetToEntities,
  } = useModelPresets(persistence, updateWorld)

  // Initial preset load runs after the project bootstrap to avoid blocking the splash screen.
  useEffect(() => {
    if (initialLoadPending) return
    refreshModelPresets().catch(console.error)
  }, [initialLoadPending, refreshModelPresets])

  
  const updateAssets = useCallback(async (updater: (prev: Map<string, Blob>) => Map<string, Blob>) => {
    setAssets((prev) => {
      const next = updater(prev)
      for (const [assetId, blob] of next) {
        const prevBlob = prev.get(assetId)
        if (prevBlob === undefined || prevBlob !== blob) {
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
      const base = sanitizeZipExportBasename(currentProject.name, `world-${id}`)
      a.download = `${base}.zip`
      a.click()
    }).catch((err) => {
      console.error('Failed to export project:', err)
      alert('Failed to export project')
    })
  }, [currentProject.id, currentProject.name, world])
  
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
          resetCameraFromWorld(w)
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
  }, [refreshProjects, loadProject, resetCameraFromWorld])
  
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
    cameraTargetVerticalAngle: cameraState.targetVerticalAngle,
    editorFreePoseRef,
    modelPresets,
    
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
    setCameraTargetVerticalAngle,
    refreshModelPresets,
    saveModelPreset,
    deleteModelPreset,
    applyModelPresetToEntities,
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
    cameraState.targetVerticalAngle,
    editorFreePoseRef,
    modelPresets,
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
    setCameraTargetVerticalAngle,
    refreshModelPresets,
    saveModelPreset,
    deleteModelPreset,
    applyModelPresetToEntities,
  ])
  
  return (
    <ProjectContext.Provider value={value}>
      {initialLoadPending ? <SplashScreen /> : children}
    </ProjectContext.Provider>
  )
}

export { ProjectContext }
