import type { RennWorld, EditorFreePose } from '@/types/world'
import type { CameraState } from '@/hooks/useCameraState'

/**
 * Build the `RennWorld` that should be persisted.
 *
 * Merges the live UI camera state (control / target / mode) and the latest
 * Builder free-fly pose into the current world document. Pure: does not mutate
 * inputs and depends only on the values passed in.
 *
 * Used by every save path (`saveProject`, `saveProjectAs`, `saveToProject`) so
 * what gets written to IndexedDB always reflects the latest in-memory camera
 * choices, not the last persisted snapshot.
 */
export function buildWorldToSave(
  currentWorld: RennWorld,
  cameraState: CameraState,
  editorFreePose: EditorFreePose | null,
): RennWorld {
  const docCam = currentWorld.world.camera
  const mergedEditorFreePose = editorFreePose ?? docCam?.editorFreePose
  return {
    ...currentWorld,
    world: {
      ...currentWorld.world,
      camera: {
        ...(docCam ?? { mode: cameraState.mode, target: cameraState.target }),
        control: cameraState.control,
        target: cameraState.target,
        mode: cameraState.mode,
        targetVerticalAngle: cameraState.targetVerticalAngle,
        ...(mergedEditorFreePose != null ? { editorFreePose: mergedEditorFreePose } : {}),
      },
    },
  }
}
