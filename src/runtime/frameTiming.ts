/**
 * Last-frame breakdown written by `runSceneFrame` when `recordFrameTiming` is enabled.
 * Used by the optional Builder frame stats overlay (see `performance-work.md`).
 */
export interface SceneFrameTiming {
  /** Wall time for the full `runSceneFrame` call. */
  frameMs: number
  /** `RenderItemRegistry.executeTransformers` */
  transformersMs: number
  /** Rapier `step` + `syncFromPhysics` */
  physicsMs: number
  /** `runOnCollision` handlers driven by physics contacts */
  scriptCollisionsMs: number
  /** `ScriptRunner.runOnUpdate` */
  scriptsOnUpdateMs: number
  /** `CameraController.update` and related orbit/free-fly work */
  cameraMs: number
  /** Game HUD drive state (speed / wheel) when HUD is shown */
  hudMs: number
  /** Shadow focus sync + `WebGLRenderer.render` */
  renderMs: number
  /** From `WebGLRenderer.info.render` after the last `render()` (draw calls). */
  renderCalls: number
  /** From `WebGLRenderer.info.render` after the last `render()` (triangle count). */
  renderTriangles: number
  /** From `WebGLRenderer.info.memory.geometries` — unique geometry count for instancing analysis. */
  geometries: number
}

export function emptySceneFrameTiming(): SceneFrameTiming {
  return {
    frameMs: 0,
    transformersMs: 0,
    physicsMs: 0,
    scriptCollisionsMs: 0,
    scriptsOnUpdateMs: 0,
    cameraMs: 0,
    hudMs: 0,
    renderMs: 0,
    renderCalls: 0,
    renderTriangles: 0,
    geometries: 0,
  }
}
