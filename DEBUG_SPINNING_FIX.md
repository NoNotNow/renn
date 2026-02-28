# Fix: Car Spinning Persists / Grows Without Input

## Problem Statement

Users report that the car can spin ever faster even without new input: angular momentum increases over time and rotation does not stop after releasing steering keys.

## Root Cause: Rapier Force Persistence

Rapier's `addForce()` and `addTorque()` apply **persistent** forces: they remain on the rigid body across simulation steps until manually cleared with `resetForces()` / `resetTorques()`.

The game loop was:

1. Each frame: run transformers → `applyForceFromTransformer` / `applyTorqueFromTransformer` → `body.addForce()` / `body.addTorque()`
2. `world.step(dt)`
3. Repeat

Because we never called `resetForces()` or `resetTorques()`, every frame's force and torque **accumulated** on the body. So:

- Frame 1: add torque T → effective torque = T  
- Frame 2: add torque T again → effective torque = 2T  
- Frame N: effective torque = N×T  

When the user released the key, we stopped calling `addTorque()`, but the **already accumulated** torque (e.g. 10×T) stayed on the body. The physics step kept applying that same large torque every frame, so angular velocity kept increasing with no new input.

## The Fix: Clear Forces Before Each Frame

1. **`PhysicsWorld.resetAllForces()`**  
   In [`src/physics/rapierPhysics.ts`](src/physics/rapierPhysics.ts), a new method iterates all dynamic bodies and calls `body.resetForces(true)` and `body.resetTorques(true)`.

2. **Call it before applying transformer output**  
   In [`src/runtime/renderItemRegistry.ts`](src/runtime/renderItemRegistry.ts), `executeTransformers()` calls `this.physicsWorld.resetAllForces()` at the start of each frame, before applying any transformer forces or torques.

Each frame now applies only that frame’s forces/torques; there is no cross-frame accumulation, so angular velocity decays as expected when the user releases the keys (via Rapier’s angular damping).

## Physics Flow After Fix

```
Each frame:
  1. resetAllForces()     → clear persistent forces/torques on all dynamic bodies
  2. executeTransformers  → transformers output force/torque for this frame only
  3. applyForce / applyTorque → body.addForce / addTorque (once per frame)
  4. world.step(dt)       → integrate; next frame starts again from step 1
```

## Files Changed

- [`src/physics/rapierPhysics.ts`](src/physics/rapierPhysics.ts) — added `resetAllForces()`
- [`src/runtime/renderItemRegistry.ts`](src/runtime/renderItemRegistry.ts) — call `resetAllForces()` at top of `executeTransformers()`

## Testing

- **CarTransformer unit tests** ([`src/transformers/presets/carTransformer.test.ts`](src/transformers/presets/carTransformer.test.ts)): zero input → zero output; deterministic and idempotent output.
- **Rapier force accumulation** ([`src/physics/forceAccumulation.test.ts`](src/physics/forceAccumulation.test.ts)): without reset, torque accumulates and angular velocity grows super-linearly; with `resetAllForces()` before each apply, growth is bounded and angular velocity decays after torque stops.
- **Game loop integration** ([`src/transformers/integration.test.ts`](src/transformers/integration.test.ts)): steering for 10 frames then release for 20 — angular velocity decays; with no input for 30 frames, angular velocity stays near zero.

## Previous Approach (Superseded)

An earlier analysis assumed the bug was in CarTransformer (e.g. damping only when `speed > 0.1`), and proposed adding manual counter-torque in the transformer. The actual bug was at the physics layer (persistent forces/torques never cleared). The correct fix is clearing forces each frame; the CarTransformer does not need manual angular damping for this issue.
