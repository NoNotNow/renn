import { createContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import type { RennWorld, Vec3, Quat } from '@/types/world'
import type { ProjectMeta } from '@/persistence/types'
import { sampleWorld } from '@/data/sampleWorld'
import { uiLogger } from '@/utils/uiLogger'

const persistence = createIndexedDbPersistence()

interface CurrentProject {
  id: string | null
  name: string
  isDirty: boolean
}

interface CameraState {
  control: 'free' | 'follow' | 'top' | 'front' | 'right'
  target: string
  mode: 'follow' | 'firstPerson' | 'thirdPerson'
}

interface ProjectContextState {
  currentProject: CurrentProject
  world: RennWorld
  assets: Map<string, Blob>
  projects: ProjectMeta[]
  version: number
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: 'follow' | 'firstPerson' | 'thirdPerson'
}

interface ProjectContextActions {
  // Project operations
  newProject: () => void
  loadProject: (id: string) => Promise<void>
  saveProject: () => Promise<void>
  saveProjectAs: (name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  refreshProjects: () => void
  
  // World editing (marks dirty)
  updateWorld: (updater: (prev: RennWorld) => RennWorld) => void
  updateAssets: (updater: (prev: Map<string, Blob>) => Map<string, Blob>) => void
  
  // State sync
  syncPosesFromScene: (poses: Map<string, { position: Vec3; rotation: Quat }>) => void
  
  // Export/Import
  exportProject: () => void
  importProject: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  
  // Play mode
  handlePlay: () => void
  
  // Camera state
  setCameraControl: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  setCameraTarget: (target: string) => void
  setCameraMode: (mode: 'follow' | 'firstPerson' | 'thirdPerson') => void
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
  const [assets, setAssets] = useState<Map<string, Blob>>(new Map())
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [version, setVersion] = useState(0)
  
  // Combined camera state to reduce re-renders
  const [cameraState, setCameraState] = useState<CameraState>(() => ({
    control: (sampleWorld.world.camera?.control ?? 'free') as 'free' | 'follow' | 'top' | 'front' | 'right',
    target: sampleWorld.world.camera?.target ?? 'ball',
    mode: sampleWorld.world.camera?.mode ?? 'follow',
  }))
  
  // Individual setters for backward compatibility
  const setCameraControl = useCallback((control: CameraState['control']) => {
    setCameraState(prev => ({ ...prev, control }))
  }, [])
  
  const setCameraTarget = useCallback((target: string) => {
    setCameraState(prev => ({ ...prev, target }))
  }, [])
  
  const setCameraMode = useCallback((mode: CameraState['mode']) => {
    setCameraState(prev => ({ ...prev, mode }))
  }, [])
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const refreshProjects = useCallback(() => {
    uiLogger.click('Builder', 'Refresh project list')
    persistence.listProjects().then(setProjects).catch(console.error)
  }, [])
  
  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])
  
  const newProject = useCallback(() => {
    uiLogger.click('Builder', 'New project')
    setWorld(sampleWorld)
    setAssets(new Map())
    setCurrentProject({
      id: null,
      name: 'Untitled',
      isDirty: false,
    })
    setCameraState({
      control: (sampleWorld.world.camera?.control ?? 'free') as 'free' | 'follow' | 'top' | 'front' | 'right',
      target: sampleWorld.world.camera?.target ?? '',
      mode: sampleWorld.world.camera?.mode ?? 'follow',
    })
    setVersion((v) => v + 1)
  }, [])
  
  const loadProject = useCallback(async (id: string) => {
    try {
      uiLogger.select('Builder', 'Open project', { projectId: id })
      const { world: w, assets: a } = await persistence.loadProject(id)
      // Get project meta inline instead of depending on projects array
      const allProjects = await persistence.listProjects()
      const projectMeta = allProjects.find((p) => p.id === id)
      
      setWorld(w)
      setAssets(a)
      setCurrentProject({
        id,
        name: projectMeta?.name ?? `Project ${id}`,
        isDirty: false,
      })
      setCameraState({
        control: (w.world.camera?.control ?? 'free') as 'free' | 'follow' | 'top' | 'front' | 'right',
        target: w.world.camera?.target ?? '',
        mode: w.world.camera?.mode ?? 'follow',
      })
      setVersion((v) => v + 1)
    } catch (err) {
      console.error('Failed to open project:', err)
      alert('Failed to open project')
    }
  }, [])
  
  const saveProject = useCallback(async () => {
    try {
      const id = currentProject.id ?? `proj_${Date.now()}`
      // Generate name dynamically to avoid dependency on projects.length
      const name = currentProject.name === 'Untitled' 
        ? `World ${Date.now()}` 
        : currentProject.name
      
      uiLogger.click('Builder', 'Save project', { projectId: id, projectName: name })
      await persistence.saveProject(id, name, { world, assets })
      
      setCurrentProject({
        id,
        name,
        isDirty: false,
      })
      refreshProjects()
    } catch (err) {
      console.error('Failed to save project:', err)
      alert('Failed to save project')
    }
  }, [currentProject, world, assets, refreshProjects])
  
  const saveProjectAs = useCallback(async (name: string) => {
    try {
      const id = `proj_${Date.now()}`
      uiLogger.click('Builder', 'Save as new project', { projectId: id, projectName: name })
      await persistence.saveProject(id, name, { world, assets })
      
      setCurrentProject({
        id,
        name,
        isDirty: false,
      })
      refreshProjects()
    } catch (err) {
      console.error('Failed to save project:', err)
      alert('Failed to save project')
    }
  }, [world, assets, refreshProjects])
  
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
  
  const updateWorld = useCallback((updater: (prev: RennWorld) => RennWorld) => {
    setWorld(updater)
    setCurrentProject((prev) => ({ ...prev, isDirty: true }))
  }, [])
  
  const updateAssets = useCallback((updater: (prev: Map<string, Blob>) => Map<string, Blob>) => {
    setAssets(updater)
    setCurrentProject((prev) => ({ ...prev, isDirty: true }))
  }, [])
  
  const syncPosesFromScene = useCallback((poses: Map<string, { position: Vec3; rotation: Quat }>) => {
    setWorld((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => {
        const pose = poses.get(e.id)
        return pose ? { ...e, position: pose.position, rotation: pose.rotation } : e
      }),
    }))
  }, [])
  
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
          setWorld(w)
          setAssets(new Map())
          setCurrentProject({
            id: null,
            name: 'Untitled',
            isDirty: false,
          })
          setVersion((v) => v + 1)
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
    window.location.href = `/play?world=${encodeURIComponent(JSON.stringify(world))}`
  }, [world])
  
  // Memoize context value to prevent unnecessary re-renders
  const value: ProjectContextValue = useMemo(() => ({
    // State
    currentProject,
    world,
    assets,
    projects,
    version,
    cameraControl: cameraState.control,
    cameraTarget: cameraState.target,
    cameraMode: cameraState.mode,
    
    // Actions
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    syncPosesFromScene,
    exportProject,
    importProject,
    onFileChange,
    fileInputRef,
    handlePlay,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
  }), [
    currentProject,
    world,
    assets,
    projects,
    version,
    cameraState.control,
    cameraState.target,
    cameraState.mode,
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    deleteProject,
    refreshProjects,
    updateWorld,
    updateAssets,
    syncPosesFromScene,
    exportProject,
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
      {children}
    </ProjectContext.Provider>
  )
}

export { ProjectContext }
