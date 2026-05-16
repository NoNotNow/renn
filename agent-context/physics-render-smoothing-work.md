# Physics/render smoothing work

Status: first implementation slice added 2026-05-01. Goal: reduce visible flicker/judder when physics uses a fixed timestep and rendering paints at a separate FPS, especially during car acceleration and deceleration.

## Problem

The runtime uses a semi-fixed physics accumulator inside the `SceneView` rAF loop. When the accumulator has no full physics step, the app still renders. Today those render-only frames reuse the last synced physics pose. On the next physics step, meshes jump to the newest pose. That zero-order hold is most visible when render FPS is higher than physics FPS, frame pacing varies, or velocity changes quickly.

Likely symptoms:

- repeated visual pose on render-only frames;
- larger visual jumps after physics catch-up;
- camera follow judder if the camera tracks stepped poses;
- stronger perception during acceleration, braking, and steering corrections.

## Systems involved

- `src/components/SceneView.tsx`: owns rAF timing, simulation settings, accumulator remainder, multi-step catch-up, and render-only ticks.
- `src/runtime/sceneFrameLoop.ts`: coordinates physics, transformers, scripts, camera, HUD, shadows, and final render for each pushed frame.
- `src/physics/rapierPhysics.ts`: steps Rapier and caches authoritative body transforms after each fixed physics tick.
- `src/runtime/renderItemRegistry.ts`: syncs cached physics transforms into Three meshes and exposes entity pose reads to camera, scripts, gizmos, and persistence helpers.
- `src/runtime/renderItem.ts`: per-entity runtime mesh/body wrapper.
- `src/camera/cameraController.ts`: reads target entity pose for follow, third-person, tracking, and first-person camera modes.
- Transformer and script systems: should keep using fixed-step authoritative simulation state unless a later task intentionally changes that contract.

## First obvious solution: visual interpolation

Add render-side interpolation between the previous and current authoritative physics poses.

Expected flow:

```mermaid
flowchart LR
  rafTick[requestAnimationFrame] --> accumulator[SemiFixedAccumulator]
  accumulator --> physicsStep[FixedPhysicsStep]
  physicsStep --> cacheCurrent[CacheCurrentPhysicsPose]
  cacheCurrent --> preservePrevious[PreservePreviousVisualPose]
  accumulator --> alpha[alphaEqualsRemainderOverFixedDt]
  preservePrevious --> interpolate[InterpolateVisualPose]
  alpha --> interpolate
  interpolate --> render[Render]
```

Implementation considerations:

- Keep simulation deterministic: physics, transformers, scripts, collision hooks, and save/export should continue to use authoritative fixed-step state.
- Split authoritative pose sync from visual pose application. A registry API like `syncFromPhysics()` plus `applyInterpolatedVisualPoses(alpha)` is acceptable if the contract is documented and tested.
- Store previous/current poses per physics-backed render item, preferably reusing `THREE.Vector3` and `THREE.Quaternion` objects to avoid hot-path allocation.
- Interpolate positions with `lerpVectors` and rotations with quaternion `slerpQuaternions`.
- Clamp alpha to `[0, 1]`; exact `0` should show the previous pose, exact `1` should show the current pose.
- Apply visual base quaternions after interpolation so flat-shape/model visual offsets remain correct.
- Distance-culled/frozen bodies should keep the current skip behavior.

Implementation slice added:

- `src/runtime/visualPoseInterpolation.ts` clamps alpha and interpolates position/quaternion.
- `RenderItemRegistry.syncFromPhysics()` now records previous/current cached physics poses for physics-backed items.
- `RenderItemRegistry.applyInterpolatedVisualPoses(alpha)` applies display-only interpolation to meshes.
- Authoritative registry reads prefer cached physics transforms; camera wiring uses visual pose reads.
- `SceneView` passes `simAccumulator / fixedDt` into `runSceneFrame`, and the frame loop applies interpolation before camera update/render.

**Edit-navigation (Builder Ctrl+E):** Physics step and `syncFromPhysics()` are skipped while edit-navigation is on, so previous/current visual buffers are not advanced. The frame therefore **does not** call `applyInterpolatedVisualPoses` in that mode; otherwise stale endpoints would overwrite meshes every frame and break TransformControls.

## Camera follow smoothing

After mesh interpolation works, evaluate camera behavior separately. Meshes can look smoother while the camera still judders if it reads stepped target poses.

Candidate changes:

- Let camera target reads use the same interpolated visual pose as the rendered mesh for follow-like modes.
- Replace fixed `currentTarget.lerp(pos, 0.1)` smoothing with dt-based smoothing, for example `alpha = 1 - Math.exp(-rate * dt)`, so camera feel is consistent across display refresh rates.
- Keep first-person behavior under closer review because direct target pose coupling can be desirable for responsiveness but can also amplify stepped motion.

## Performance warnings

Raising physics FPS is a possible experiment, not the first fix.

Warning: 120/240 Hz physics can degrade performance by multiplying Rapier steps, transformer execution, script updates, sync work, and collision processing.

Warning: do not change the default physics rate without before/after profiling on a heavy world.

Warning: if exposed to users, higher physics rate should be presented as a quality/performance tradeoff, not a free smoothness setting.

## Evaluation plan

1. Capture a baseline with the existing car acceleration/deceleration repro: physics `fixedDt`, display refresh rate if known, Frame Stats overlay, and a short browser Performance trace when practical.
2. Add visual interpolation and run targeted tests.
3. Re-test acceleration, braking, steady cruise, steering, collisions, and camera follow.
4. If mesh motion improves but perceived flicker remains, evaluate camera target interpolation and dt-based follow smoothing.
5. Only then test higher physics FPS as a measured fallback, recording frame-time cost.

## Testing plan

- Unit test interpolation math: alpha clamp, position lerp, quaternion slerp, exact endpoints.
- Registry tests: applying interpolated visual poses should not advance physics, mutate entity pose unexpectedly, or break static entities.
- Loop tests: render-only and one-step frames should pass the correct interpolation alpha.
- Camera tests: dt-based smoothing should behave consistently for equivalent elapsed time split across different frame counts.
- Integration test: a simple accelerating/decelerating car-like entity should show smoother visual progression between fixed physics ticks.

## Documentation links

Keep this file linked from `agent-context/performance-work.md` because smoothing can be confused with raw frame-time optimization. The first fix should improve perceptual smoothness without increasing simulation cost.
