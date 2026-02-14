# Fix: Car Spinning Persists After Releasing W+D

## Problem Statement
When W (throttle) and D (steer_right) are pressed **simultaneously**:
1. The car starts spinning
2. After releasing **both keys**, the spinning **persists indefinitely**
3. The car does not stop rotating

## Root Cause Analysis

### Input Path (Confirmed Working)
```
rawInput.ts:
  - keydown 'D' → keys.d = true
  - keyup 'D' → keys.d = false   ✓ Correctly resets

↓

inputMapping.ts: applyInputMapping()
  - Reads keys.d and creates action { steer_right: 1.0 or 0 }  ✓ Correct

↓

CarTransformer.transform():
  - Reads steerRight action value
  - Generates torque based on steering input
  - **PROBLEM: Damping logic was incorrectly scoped**
```

### The Bug in Original CarTransformer Code

```typescript
// ORIGINAL (BUGGY) CODE
if (speed > 0.1) {
  if (Math.abs(steerAmount) > 0.01) {
    torque = new THREE.Vector3(0, steerAmount, 0)
  } else {
    // Damping code here
  }
}

// Problem: When speed drops below 0.1 m/s, NO DAMPING is applied!
// After W is released, the car coasts and speed decreases
// When speed < 0.1, damping logic never executes
// Result: Angular velocity persists indefinitely
```

### Why It Only Happens with W+D Together

1. **W alone**: Car accelerates, then coasts. Linear velocity dominates, car naturally stops.
2. **D alone**: No forward momentum, car doesn't spin much, physics naturally damps.
3. **W+D together**: 
   - Car gets forward velocity from W
   - Car gets angular velocity from D
   - When keys release: W reduced to 0 (force stops being applied)
   - Car coasts forward with **persistent angular velocity**
   - Speed quickly drops below 0.1 m/s threshold
   - **Damping code never executes because `speed < 0.1`**
   - Angular velocity continues rotating the body indefinitely

## The Fix

**Key insight from transformer pattern:** Each transformer step should have a **single, clear responsibility**.

Separated steering control from angular damping:

```typescript
// Steering torque (only when moving at speed)
let torque: THREE.Vector3 | undefined
const steerAmount = (steerRight - steerLeft) * steering * (speed / 10)

if (speed > 0.1) {
  torque = new THREE.Vector3(0, steerAmount, 0)
}

// Angular damping (INDEPENDENT of speed)
// ALWAYS applies when no steering input
const steerInput = steerRight - steerLeft
if (Math.abs(steerInput) < 0.01) {
  const [wx, wy, wz] = input.angularVelocity
  
  if (Math.abs(wy) > 0.01) {
    const dampingTorque = -wy * 10  // Strong constant damping
    torque = new THREE.Vector3(0, dampingTorque, 0)
  }
}
```

### Why This Works

1. **Steering is only applied at speed**: `if (speed > 0.1)` prevents steering at standstill ✓
2. **Damping applies regardless of speed**: Executes independently ✓
3. **Damping is always active when steering input is released**: `Math.abs(steerInput) < 0.01` ✓
4. **Strong damping coefficient** (10 vs previous ~0.25): Quickly stops rotation ✓

## Physics Flow Verification

```
Frame N: W+D pressed
  ├─ InputTransformer: steerRight = 1.0, throttle = 1.0
  ├─ CarTransformer: torque = [0, steering_value, 0], force = forward
  └─ PhysicsWorld.applyTorque(): body.addTorque(torque)

Frame N+1: W+D released (keys.w = false, keys.d = false)
  ├─ InputTransformer: steerRight = 0, throttle = 0
  ├─ CarTransformer:
  │  ├─ Steering: speed may be < 0.1, no steering torque ✓
  │  └─ Damping: steerInput = 0, apply -wy * 10 counter-torque ✓
  └─ PhysicsWorld.applyTorque(): body.addTorque([0, -angular_velocity * 10, 0])

Frame N+2 onwards:
  ├─ InputTransformer: steerRight = 0, throttle = 0 (no change)
  ├─ CarTransformer: Damping continues to apply counter-torque
  ├─ Angular velocity decreases each frame
  └─ Eventually stops when |wy| < 0.01
```

## Files Changed
- [src/transformers/presets/carTransformer.ts](src/transformers/presets/carTransformer.ts)
  - Separated steering and damping logic
  - Damping now applies independently of speed threshold
  - Increased damping strength from ~0.25 to 10

## Testing

The fix maintains:
- ✓ Steering works when moving (speed > 0.1)
- ✓ No steering at standstill
- ✓ Forward/backward throttle unchanged
- ✓ Friction and handbrake unchanged
- ✓ Angular velocity properly damped after steering stops

## Transformer Pattern Application

This fix demonstrates the **transformer pattern principle**: each transformer handles a **single responsibility**:

1. **Steering Transformer**: "Generate torque based on user input and speed"
2. **Damping Transformer**: "Dissipate angular momentum when no steering input"

These operate independently, making the system more maintainable and predictable.
