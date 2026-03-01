# Bug Reference: Physics Force Accumulation (Spinning)

## Problem

Rapier's `addForce()` and `addTorque()` are **persistent**: forces remain on the body across steps until explicitly cleared. Without a reset, each frame's force accumulates (frame N → torque = N×T), causing angular velocity to grow without bound and not stop after releasing keys.

## Fix

Call `physicsWorld.resetAllForces()` at the **start of each frame**, before applying transformer output.

```
Each frame:
  1. resetAllForces()       ← clears all persistent forces/torques on dynamic bodies
  2. executeTransformers()  ← transformers output force/torque for this frame only
  3. applyForce/Torque      ← body.addForce / addTorque (once per frame)
  4. world.step(dt)
```

## Files

- `src/physics/rapierPhysics.ts` — `resetAllForces()` method
- `src/runtime/renderItemRegistry.ts` — calls `resetAllForces()` at top of `executeTransformers()`
