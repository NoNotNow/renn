# Transformer API Additions - Car Example Analysis

## Overview

This document extracts and formalizes useful utility functions from the car example in `public/exampleWorlds/hunt/world.json`. These functions are repeatedly used across multiple custom transformers and should be added to the Transformer Runtime API to reduce code duplication and improve developer experience.

---

## Common Utility Functions

### 1. multiRaycast

**Purpose**: Cast multiple rays in a fan pattern for wider collision detection.

**Usage Frequency**: Used in 4+ transformers (direction, AutoBrake, Umlenker)

**Current Implementation**:
```javascript
/** @return {RaycastResult | undefined} */
function multiRaycast(
  /** @type {TransformerRuntimeApi} */ api,
  /** @type {Vec3} */ origin,
  /** @type {Vec3} */ forward,
  /** @type {number} */ distance,
  /** @type {number} */ lateralRange,
  /** @type {number} */ count
) {
  const right = api.vec.normalize(api.vec.cross(forward, [0, 1, 0]));
  const hits = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const offset = api.vec.scale(right, t * lateralRange);
    const rayOrigin = api.vec.add(origin, offset);
    const cast = raycast(api, rayOrigin, forward, distance);
    if (cast.hit) hits.push(cast);
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits[0] ?? raycast(api, origin, forward, distance);
}
```

**Proposed API Method**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Cast multiple rays in a fan pattern
   * @param origin - Starting point of the rays
   * @param forward - Forward direction vector
   * @param distance - Maximum ray distance
   * @param lateralRange - Total width of the fan (each side extends by lateralRange/2)
   * @param count - Number of rays to cast (including center)
   * @param visualize - Whether to visualize the rays (default: false)
   * @param visualizeHitColor - Color for hit visualization (default: "red")
   * @param visualizeMissColor - Color for miss visualization (default: "green")
   * @returns The closest hit result, or undefined if no hit
   */
  multiRaycast(
    origin: Vec3,
    forward: Vec3,
    distance: number,
    lateralRange: number,
    count: number,
    options?: {
      visualize?: boolean;
      hitColor?: string;
      missColor?: string;
    }
  ): RaycastResult | undefined;
}
```

---

### 2. rotateAroundAxis ✅ Implemented (`api.vec.rotateAroundAxis`)

**Purpose**: Rotate a vector around the Y (up) axis or around an arbitrary axis (e.g., entity's up vector on slopes) by a given angle in radians.

**Usage Frequency**: Used in Umlenker for finding alternative paths

**Runtime**: `api.vec.rotateAroundAxis(vec, axis, angle)` — axis is normalized internally.

**Proposed API Method** (implemented on `TransformerVecApi`):
```typescript
interface TransformerRuntimeApi {
  /**
   * Rotate a vector around an arbitrary axis
   * @param vec - Vector to rotate
   * @param axis - Rotation axis vector (e.g., upVector for slope-relative rotation)
   * @param angle - Rotation angle in radians
   * @returns New rotated vector
   */
  rotateAroundAxis(vec: Vec3, axis: Vec3, angle: number): Vec3;
}
```

---

### 3. findCorrectionVector

**Purpose**: Find an alternative direction vector when an obstacle is detected. Tests left and right rotations to find a clear path.

**Usage Frequency**: Used in Umlenker transformer

**Current Implementation**:
```javascript
/** @returns {Vec3 | undefined} */
function findCorrectionVector(
  /** @type {TransformerRuntimeApi} */ api,
  /** @type {Vec3} */ origin,
  /** @type {Vec3} */ rotation,
  /** @type {number} */ distance
) {
  const upVector = api.getUpVector(input.rotation);
  let rightRotation = api.vec.rotateAroundAxis(rotation, upVector, -0.3)
  let leftRotation = api.vec.rotateAroundAxis(rotation, upVector, 0.3)

  let rightResult = raycast(api, origin, rightRotation, distance);
  let leftResult = raycast(api, origin, leftRotation, distance);
  let resultRotation = undefined;

  if (rightResult.hit && leftResult.hit) {
    resultRotation = leftResult.distance > rightResult.distance ? leftRotation : rightRotation;
  } else if (!rightResult.hit) {
    resultRotation = rightRotation;
  } else {
    resultRotation = leftRotation;
  }

  return api.vec.add(origin, api.vec.scale(api.vec.normalize(resultRotation), distance));
}
```

**Proposed API Method**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Find a correction vector to avoid obstacles
   * Tests multiple angles and returns the best clear direction
   * @param origin - Starting point
   * @param forward - Forward direction vector
   * @param distance - Test distance
   * @param options - Configuration options
   * @returns A target position vector in a clear direction, or undefined if all directions blocked
   */
  findClearDirection(
    origin: Vec3,
    forward: Vec3,
    distance: number,
    options?: {
      angleOffset?: number;      // Angle to test on each side (default: 0.3 radians)
      testCount?: number;        // Number of angles to test on each side (default: 1)
      preferDirection?: 'left' | 'right' | 'farther' | 'nearest';
      visualize?: boolean;
      hitColor?: string;
      missColor?: string;
    }
  ): Vec3 | undefined;
}
```

---

### 4. Enhanced raycast with Visualization ✅ Implemented

**Purpose**: Basic raycast with optional debug visualization.

**Current Pattern**:
```javascript
function raycast(api, origin, rotation, distance) {
  let result = api.raycast(origin, rotation, distance);
  if (result.hit === true) {
    api.visualizeLine(origin, api.vec.add(api.vec.scale(rotation, result.distance), origin), "red");
  } else {
    api.visualizeLine(origin, api.vec.add(api.vec.scale(rotation, distance), origin), "green");
  }
  return result;
}
```

**Proposed API Enhancement**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Perform raycast with optional visualization
   * @param origin - Ray origin
   * @param direction - Ray direction (normalized)
   * @param distance - Maximum distance
   * @param options - Optional visualization settings
   * @returns Raycast result
   */
  raycast(
    origin: Vec3,
    direction: Vec3,
    distance: number,
    options?: {
      visualize?: boolean;
      hitColor?: string;
      missColor?: string;
    }
  ): RaycastResult;
}
```

---

## State Management Utilities

### 1. Timer-Based State Objects

**Pattern**: State objects with expiration timers for temporary behaviors.

**Examples Found**:
- `driveAway` - Triggers when too close to target, expires after 300ms
- `backOff` - Triggers when collision detected, expires after 700-1000ms
- `manouver` - Triggers when obstacle avoidance active, expires after 900-2000ms

**Current Pattern**:
```javascript
var driveAway = {
  isOn: function () { return this.lastTriggerDate + 300 > Date.now(); },
  trigger: function () { this.lastTriggerDate = Date.now(); },
  lastTriggerDate: new Date(0)
}
```

**Proposed API Utility**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Create a timer-based state object
   * @param duration - Duration in milliseconds
   * @returns State object with isOn() and trigger() methods
   */
  createTimerState(duration: number): {
    isOn: () => boolean;
    trigger: () => void;
    reset: () => void;
    remaining: () => number;
  };
}
```

---

## Vector Math Utilities

### 1. Project Vector Onto Plane ✅ Implemented (`api.vec.projectOntoPlane`)

**Pattern**: Zero out Y component for 2D/XZ plane operations, or project relative to entity's up vector on slopes.

**Runtime**: `api.vec.projectOntoPlane(vec, planeNormal)` — use `api.getUpVector(input.rotation)` on slopes, `[0, 1, 0]` for world XZ.

**Proposed API Method** (implemented on `TransformerVecApi`):
```typescript
interface TransformerRuntimeApi {
  /**
   * Project a vector onto a plane defined by its normal
   * @param vec - Vector to project
   * @param planeNormal - Normal vector of the plane (e.g., upVector for slope-relative projection)
   * @returns Vector projected onto the plane
   */
  projectOntoPlane(vec: Vec3, planeNormal: Vec3): Vec3;
}
```

---

## Navigational Utilities

### 1. Calculate Angle Between Vectors

**Pattern**: Calculate angle between forward vector and target direction.

**Current Pattern**:
```javascript
let dot = api.vec.dot(forward, inputToTarget);
dot = Math.max(-1, Math.min(1, dot));
let angle = Math.acos(dot);
let cross = api.vec.cross(forward, inputToTarget);
```

**Proposed API Method**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Calculate signed angle between two vectors in the XZ plane
   * @param a - First vector
   * @param b - Second vector
   * @returns Signed angle in radians (-PI to PI), positive for counter-clockwise
   */
  angleSignedXZ(a: Vec3, b: Vec3): number;

  /**
   * Calculate unsigned angle between two vectors
   * @param a - First vector
   * @param b - Second vector
   * @returns Unsigned angle in radians (0 to PI)
   */
  angle(a: Vec3, b: Vec3): number;
}
```

---

## AI Behavior Utilities

### 1. Approach Target with Speed Control

**Pattern**: Adjust target speed based on distance and angle to target.

**Current Pattern** (from direction transformer):
```javascript
const maxSpeed = 120;
const approachspeed = 3;
const approachDist = 10;
const turnSpeed = 20;
let targetSpeed = 80;

if (distance < approachDist) targetSpeed = approachspeed;
if (Math.abs(angle) > 1) targetSpeed = turnSpeed;
if (targetSpeed > maxSpeed) targetSpeed = maxSpeed;

if (targetSpeed > currentSpeed) input.actions.throttle = 1;
```

**Proposed API Method**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Calculate appropriate speed for approaching a target
   * @param currentPosition - Current entity position
   * @param targetPosition - Target position
   * @param currentVelocity - Current velocity vector
   * @param currentForward - Current forward direction
   * @param options - Speed control parameters
   * @returns Recommended throttle (0-1) and brake (0-1) values
   */
  calculateApproachActions(
    currentPosition: Vec3,
    targetPosition: Vec3,
    currentVelocity: Vec3,
    currentForward: Vec3,
    options?: {
      maxSpeed?: number;
      approachSpeed?: number;
      approachDistance?: number;
      turnSpeed?: number;
      turnAngleThreshold?: number;
    }
  ): { throttle: number; brake: number };
}
```

---

## Visualization Utilities

### 1. Visualize Speed/Value

**Pattern**: Visualize scalar values as text.

**Current Pattern**:
```javascript
api.visualize(speed, "green", "speed", 1);
```

**Proposed API Enhancement**:
```typescript
interface TransformerRuntimeApi {
  /**
   * Visualize a numeric value at a position
   * @param value - The value to display
   * @param color - Text color
   * @param label - Optional label/prefix
   * @param decimalPlaces - Number of decimal places (default: 2)
   * @param position - World position to display at (default: entity position)
   * @param size - Text size multiplier (default: 1)
   */
  visualizeValue(
    value: number,
    color: string,
    label?: string,
    options?: {
      decimalPlaces?: number;
      position?: Vec3;
      size?: number;
    }
  ): void;
}
```

---

## Implementation Priority

### Phase 1: High Priority (Most Used)
1. **multiRaycast** - Used in multiple transformers, fundamental for collision detection
2. **rotateAroundAxis** ✅ — `api.vec.rotateAroundAxis`
3. **Enhanced raycast with visualization** ✅ — `api.raycast(..., { visualize })`
4. **projectOntoPlane** ✅ — `api.vec.projectOntoPlane`

### Phase 2: Medium Priority
4. **findClearDirection** - Useful for obstacle avoidance
5. **createTimerState** - Cleaner state management
6. **angleSignedXZ** - Navigation calculations

### Phase 3: Low Priority (Can be composed from others)
8. **calculateApproachActions** - More complex, can be built from simpler utilities
9. **visualizeValue** - Nice to have but not critical

---

## Usage Examples

### Example: AutoBrake Transformer (Simplified)

**Before**:
```javascript
function multiRaycast(api, origin, forward, distance, lateralRange, count) { ... }
function raycast(api, origin, rotation, distance) { ... }

function transform(input, dt, params, state, api) {
  let forward = api.getForwardVector(input.rotation);
  let speed = api.vec.dot(input.velocity, forward);
  let frontPosition = api.vec.add(input.position, api.vec.scale(forward, 5));
  
  if (speed > 0) {
    let castResult = multiRaycast(api, frontPosition, forward, speed * speed / 300, 2, 8);
    if (castResult.hit === true) {
      if (speed > 0.1) {
        let breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200);
        if (breakSpeed > 1) breakSpeed = 1;
        input.actions.brake = breakSpeed;
        input.actions.throttle = 0;
      }
    }
  }
  return {};
}
```

**After (with API additions)**:
```javascript
function transform(input, dt, params, state, api) {
  let forward = api.getForwardVector(input.rotation);
  let speed = api.vec.dot(input.velocity, forward);
  let frontPosition = api.vec.add(input.position, api.vec.scale(forward, 5));
  
  if (speed > 0) {
    let castResult = api.multiRaycast(
      frontPosition, 
      forward, 
      speed * speed / 300, 
      2, 
      8,
      { visualize: true, hitColor: "red" }
    );
    if (castResult?.hit === true && speed > 0.1) {
      let breakSpeed = Math.min(1, (speed * speed) / (200 * (castResult.distance + 1)));
      input.actions.brake = breakSpeed;
      input.actions.throttle = 0;
    }
  }
  return {};
}
```

---

### Example: Umlenker Transformer (Simplified)

**Before**:
```javascript
function rotateOnYAxis(inputVector, angle) { ... }
function raycast(api, origin, rotation, distance) { ... }
function findCorrectionVector(api, origin, rotation, distance) { ... }

function transform(input, dt, params, state, api) {
  let forward = api.getForwardVector(input.rotation);
  let frontPosition = api.vec.add(input.position, api.vec.scale(forward, 5));

  if (multiRaycast(api, frontPosition, forward, 30, 2, 10).hit) {
    let corr = findCorrectionVector(api, frontPosition, forward, 30);
    if (corr) {
      input.target.pose.position = corr;
    }
  }
  return {};
}
```

**After (with API additions)**:
```javascript
function transform(input, dt, params, state, api) {
  let forward = api.getForwardVector(input.rotation);
  let frontPosition = api.vec.add(input.position, api.vec.scale(forward, 5));

  if (api.multiRaycast(frontPosition, forward, 30, 2, 10, { visualize: true }).hit) {
    let corr = api.findClearDirection(frontPosition, forward, 30, { 
      angleOffset: 0.3,
      visualize: true 
    });
    if (corr) {
      input.target.pose.position = corr;
    }
  }
  return {};
}
```

---

## Benefits of API Integration

1. **Reduced Code Duplication**: Eliminates repeated utility function definitions
2. **Improved Performance**: Native implementations can be optimized
3. **Better Debugging**: Built-in visualization options
4. **Type Safety**: TypeScript definitions provide better developer experience
5. **Consistency**: Standardized behavior across all transformers
6. **Discoverability**: Developers can find these utilities through API documentation
7. **Maintainability**: Bug fixes and improvements benefit all users

---

## Next Steps

1. Review and prioritize the proposed API additions
2. Implement the Phase 1 utilities first (multiRaycast, rotateAroundAxis, projectOntoPlane, enhanced raycast)
3. Create TypeScript definitions
4. Add unit tests for each utility
5. Document each addition in the main API documentation
6. Gradually migrate existing examples to use new API methods
7. Gather feedback from users and iterate
