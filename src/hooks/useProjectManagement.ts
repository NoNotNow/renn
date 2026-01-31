import { useState, useCallback, useEffect, useRef } from 'react'
import { createIndexedDbPersistence } from '@/persistence/indexedDb'
import type { RennWorld } from '@/types/world'
import type { ProjectMeta } from '@/persistence/types'
import { sampleWorld } from '@/data/sampleWorld'
import { uiLogger } from '@/utils/uiLogger'

const persistence = createIndexedDbPersistence()

export interface ProjectState {
  world: RennWorld
  assets: Map<string, Blob>
  projects: ProjectMeta[]
  currentProjectId: string | null
}

export interface ProjectActions {
  setWorld: React.Dispatch<React.SetStateAction<RennWorld>>
  setAssets: React.Dispatch<React.SetStateAction<Map<string, Blob>>>
  loadProjects: () => void
  handleNew: () => void
  handleOpen: (id: string) => void
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
  handleDelete: () => Promise<void>
  handleExport: () => void
  handleImport: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handlePlay: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}

export interface CameraState {
  cameraControl: 'free' | 'follow' | 'top' | 'front' | 'right'
  cameraTarget: string
  cameraMode: 'follow' | 'firstPerson' | 'thirdPerson'
  setCameraControl: (control: 'free' | 'follow' | 'top' | 'front' | 'right') => void
  setCameraTarget: (target: string) => void
  setCameraMode: (mode: 'follow' | 'firstPerson' | 'thirdPerson') => void
}

export interface UseProjectManagementResult extends ProjectState, ProjectActions, CameraState {}

export function useProjectManagement(): UseProjectManagementResult {
  const [world, setWorld] = useState<RennWorld>(sampleWorld)
  const [assets, setAssets] = useState<Map<string, Blob>>(new Map())
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [cameraControl, setCameraControl] = useState<'free' | 'follow' | 'top' | 'front' | 'right'>(
    (sampleWorld.world.camera?.control ?? 'free') as 'free' | 'follow' | 'top' | 'front' | 'right'
  )
  const [cameraTarget, setCameraTarget] = useState(sampleWorld.world.camera?.target ?? 'ball')
  const [cameraMode, setCameraMode] = useState<'follow' | 'firstPerson' | 'thirdPerson'>(
    sampleWorld.world.camera?.mode ?? 'follow'
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProjects = useCallback(() => {
    uiLogger.click('Builder', 'Refresh project list')
    persistence.listProjects().then(setProjects).catch(console.error)
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleNew = useCallback(() => {
    uiLogger.click('Builder', 'New project')
    setWorld(sampleWorld)
    setAssets(new Map())
    setCurrentProjectId(null)
    setCameraControl((sampleWorld.world.camera?.control ?? 'free') as 'free' | 'follow' | 'top' | 'front' | 'right')
    setCameraTarget(sampleWorld.world.camera?.target ?? '')
    setCameraMode(sampleWorld.world.camera?.mode ?? 'follow')
  }, [])

  const handleOpen = useCallback(
    (id: string) => {
      uiLogger.select('Builder', 'Open project', { projectId: id })
      persistence.loadProject(id).then(({ world: w, assets: a }) => {
        setWorld(w)
        setAssets(a)
        setCurrentProjectId(id)
        setCameraControl((w.world.camera?.control ?? 'free') as 'free' | 'follow' | 'top' | 'front' | 'right')
        setCameraTarget(w.world.camera?.target ?? '')
        setCameraMode(w.world.camera?.mode ?? 'follow')
      }).catch((err) => {
        console.error('Failed to open project:', err)
        alert('Failed to open project')
      })
    },
    []
  )

  const handleSave = useCallback(async () => {
    try {
      const id = currentProjectId ?? `proj_${Date.now()}`
      const name = projects.find((p) => p.id === id)?.name ?? `World ${projects.length + 1}`
      uiLogger.click('Builder', 'Save project', { projectId: id, projectName: name })
      await persistence.saveProject(id, name, { world, assets })
      setCurrentProjectId(id)
      loadProjects()
    } catch (err) {
      console.error('Failed to save project:', err)
      alert('Failed to save project')
    }
  }, [currentProjectId, world, assets, projects, loadProjects])

  const handleSaveAs = useCallback(async () => {
    const name = prompt('Project name:', `World ${projects.length + 1}`) ?? `World ${projects.length + 1}`
    const id = `proj_${Date.now()}`
    uiLogger.click('Builder', 'Save as new project', { projectId: id, projectName: name })
    try {
      await persistence.saveProject(id, name, { world, assets })
      setCurrentProjectId(id)
      loadProjects()
    } catch (err) {
      console.error('Failed to save project:', err)
      alert('Failed to save project')
    }
  }, [world, assets, projects.length, loadProjects])

  const handleDelete = useCallback(async () => {
    const id = currentProjectId
    if (!id) return
    if (!confirm('Delete this project?')) return
    uiLogger.delete('Builder', 'Delete project', { projectId: id })
    try {
      await persistence.deleteProject(id)
      handleNew()
      loadProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert('Failed to delete project')
    }
  }, [currentProjectId, handleNew, loadProjects])

  const handleExport = useCallback(() => {
    const id = currentProjectId
    uiLogger.click('Builder', 'Export/Download project', { projectId: id ?? 'unsaved', format: id ? 'zip' : 'json' })
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
  }, [currentProjectId, world])

  const handleImport = useCallback(() => {
    uiLogger.click('Builder', 'Import/Upload project - open file dialog')
    fileInputRef.current?.click()
  }, [])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const isZip = file.name.toLowerCase().endsWith('.zip')
      uiLogger.upload('Builder', 'Import project file', { fileName: file.name, fileType: isZip ? 'zip' : 'json', fileSize: file.size })
      if (isZip) {
        persistence.importProject(file).then(({ id }) => {
          loadProjects()
          handleOpen(id)
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
            setCurrentProjectId(null)
          } catch {
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
    uiLogger.click('Builder', 'Play - navigate to play mode')
    window.location.href = `/play?world=${encodeURIComponent(JSON.stringify(world))}`
  }, [world])

  return {
    // State
    world,
    assets,
    projects,
    currentProjectId,
    // Actions
    setWorld,
    setAssets,
    loadProjects,
    handleNew,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleDelete,
    handleExport,
    handleImport,
    onFileChange,
    handlePlay,
    fileInputRef,
    // Camera state
    cameraControl,
    cameraTarget,
    cameraMode,
    setCameraControl,
    setCameraTarget,
    setCameraMode,
  }
}
