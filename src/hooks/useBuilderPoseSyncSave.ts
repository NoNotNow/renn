import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import type { SceneViewHandle } from '@/components/SceneView'
import { useTransientSnackbar } from '@/hooks/useTransientSnackbar'
import type { RennWorld, Rotation, Vec3 } from '@/types/world'
import type { ProjectMeta } from '@/persistence/types'

type ScenePoses = Map<string, { position: Vec3; rotation: Rotation; scale?: Vec3 }>

export interface BuilderFileShortcutHandlersRef {
  onSave: () => void
  onSaveAs: () => void
  onNew: () => void
}

export interface UseBuilderPoseSyncSaveParams {
  sceneViewRef: RefObject<SceneViewHandle | null>
  fileShortcutHandlersRef: MutableRefObject<BuilderFileShortcutHandlersRef>
  currentProject: { id: string | null; name: string; isDirty: boolean }
  projects: ProjectMeta[]
  saveProject: () => Promise<boolean>
  saveProjectAs: (name: string) => Promise<boolean>
  saveToProject: (id: string) => Promise<boolean>
  syncPosesFromScene: (poses: ScenePoses) => void
  syncPosesToRefOnly: (poses: ScenePoses) => void
  newProject: () => void
  loadProject: (id: string) => void
  loadExampleWorld: (world: RennWorld, name: string, assets?: Map<string, Blob>) => void
}

export interface UseBuilderPoseSyncSaveResult {
  showSaveDialog: boolean
  setShowSaveDialog: (open: boolean) => void
  saveSnackbarMessage: string | null
  saveDialogDefaultName: string
  handleNew: () => void
  handleOpenExampleWorld: (worldJson: RennWorld, name: string) => void
  handleOpen: (id: string) => void
  handleReload: () => void
  handleSave: () => Promise<void>
  handleSaveAs: () => void
  handleSaveDialogSaveNew: (name: string) => Promise<void>
  handleSaveDialogOverwrite: (id: string) => Promise<void>
}

/**
 * Save paths that flush live scene poses into the document, plus project open/new lifecycle
 * and keyboard shortcut forwarding for file commands.
 */
export function useBuilderPoseSyncSave({
  sceneViewRef,
  fileShortcutHandlersRef,
  currentProject,
  projects,
  saveProject,
  saveProjectAs,
  saveToProject,
  syncPosesFromScene,
  syncPosesToRefOnly,
  newProject,
  loadProject,
  loadExampleWorld,
}: UseBuilderPoseSyncSaveParams): UseBuilderPoseSyncSaveResult {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const { message: saveSnackbarMessage, showSnackbar: showSaveSnackbar } = useTransientSnackbar()

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (currentProject.isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [currentProject.isDirty])

  const syncPosesThen = useCallback(
    async (fn: () => Promise<void>) => {
      const allPoses = sceneViewRef.current?.getAllPoses()
      if (allPoses) {
        syncPosesToRefOnly(allPoses)
        await fn()
        syncPosesFromScene(allPoses)
      } else {
        await fn()
      }
    },
    [sceneViewRef, syncPosesFromScene, syncPosesToRefOnly],
  )

  const handleNew = useCallback(() => {
    if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
    newProject()
  }, [currentProject.isDirty, newProject])

  const handleOpenExampleWorld = useCallback(
    (worldJson: RennWorld, name: string, assets?: Map<string, Blob>) => {
      if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
      loadExampleWorld(worldJson, name, assets)
    },
    [currentProject.isDirty, loadExampleWorld],
  )

  const handleOpen = useCallback(
    (id: string) => {
      if (currentProject.isDirty && !confirm('Discard unsaved changes?')) return
      loadProject(id)
    },
    [currentProject.isDirty, loadProject],
  )

  const handleReload = useCallback(() => {
    if (!currentProject.id) return
    if (currentProject.isDirty && !confirm('Discard unsaved changes and reload from storage?')) return
    loadProject(currentProject.id)
  }, [currentProject.id, currentProject.isDirty, loadProject])

  const handleSave = useCallback(async () => {
    if (!currentProject.id) {
      setShowSaveDialog(true)
      return
    }
    let saved = false
    await syncPosesThen(async () => {
      saved = await saveProject()
    })
    if (saved) showSaveSnackbar('Project saved')
  }, [currentProject.id, syncPosesThen, saveProject, showSaveSnackbar])

  const handleSaveAs = useCallback(() => {
    setShowSaveDialog(true)
  }, [])

  useEffect(() => {
    fileShortcutHandlersRef.current.onSave = handleSave
    fileShortcutHandlersRef.current.onSaveAs = handleSaveAs
    fileShortcutHandlersRef.current.onNew = handleNew
  }, [fileShortcutHandlersRef, handleSave, handleSaveAs, handleNew])

  const handleSaveDialogSaveNew = useCallback(
    async (name: string) => {
      let saved = false
      await syncPosesThen(async () => {
        saved = await saveProjectAs(name)
      })
      if (!saved) return
      setShowSaveDialog(false)
      showSaveSnackbar(`Saved “${name}”`)
    },
    [syncPosesThen, saveProjectAs, showSaveSnackbar],
  )

  const handleSaveDialogOverwrite = useCallback(
    async (id: string) => {
      const projectName = projects.find((p) => p.id === id)?.name ?? 'project'
      let saved = false
      await syncPosesThen(async () => {
        saved = await saveToProject(id)
      })
      if (!saved) return
      setShowSaveDialog(false)
      showSaveSnackbar(`Saved “${projectName}”`)
    },
    [syncPosesThen, saveToProject, projects, showSaveSnackbar],
  )

  const saveDialogDefaultName =
    currentProject.name !== 'Untitled' ? currentProject.name : `World ${projects.length + 1}`

  return {
    showSaveDialog,
    setShowSaveDialog,
    saveSnackbarMessage,
    saveDialogDefaultName,
    handleNew,
    handleOpenExampleWorld,
    handleOpen,
    handleReload,
    handleSave,
    handleSaveAs,
    handleSaveDialogSaveNew,
    handleSaveDialogOverwrite,
  }
}
