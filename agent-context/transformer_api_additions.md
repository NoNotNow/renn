# Transformer API — low-level additions (hunt world)

Analysis of the two driving custom transformers in `public/exampleWorlds/hunt/world.json`:

| Transformer | ID | Role |
|-------------|-----|------|
| **direction** | `car_tf4` | Steer and throttle toward `input.target` when the player is not overriding controls. |
| **AutoBrake** | `car_tf1_copy` | Raycast ahead/behind and apply brake/throttle from obstacle distance and forward speed. |

This document lists **low-level** building blocks only: vector math, raycasts, and small geometry helpers. It does **not** propose high-level AI helpers (approach speed, timer state, obstacle rerouting, and similar).

---

## Already in the runtime API

These patterns from **direction** and **AutoBrake** should use existing `api` / `api.vec` methods (no new API).

| Need | Use today |
|------|-----------|
| Forward / up from entity rotation | `api.getForwardVector(input.rotation)`, `api.getUpVector(input.rotation)` |
| Vector to target, distance | `api.vec.subtract(target, position)`, `api.vec.length(...)` |
| Horizontal steering on slopes | `api.vec.projectOntoPlane(vec, api.getUpVector(input.rotation))` |
| Unit directions | `api.vec.normalize(...)` |
| Speed along forward | `api.vec.getForwardSpeed(input.velocity, forward)` (prefer over raw `dot`) |
| Speed magnitude | `api.vec.length(input.velocity)` |
| Probe point in front of car | `api.vec.add(input.position, api.vec.scale(forward, 5))` — see **offsetAlong** below for a named helper |
| Reverse direction | `api.vec.scale(forward, -1)` (AutoBrake uses `subtract([0,0,0], forward)` today) |
| Single ray + debug line | `api.raycast(origin, direction, maxDistance, { visualize: true, hitColor, missColor })` |
| Clamp scalars | `api.clamp(value, min, max)` |
| Player input | `api.getAction(input, 'throttle')`, etc. |

---

## Duplicated local helper (both transformers)

Both transformers copy the same **`multiRaycast`** function (~25 lines): parallel rays spread sideways, return closest hit.

That logic belongs in the runtime once, with a **speaking name** (see **raycastSpread** below). After that, delete the local `multiRaycast` from world JSON when migrating.

---

## Proposed low-level additions

Names are chosen so a non-expert can guess behavior from the identifier alone. Prefer adding methods on **`api.vec`** for pure math and **`api`** for physics (raycasts).

### 1. `api.raycastSpread` — spread parallel rays (replaces `multiRaycast`)

**What it does:** From one origin, cast several rays in the **same** direction, with origins shifted sideways so you cover a wider area (like a car bumper).

**Used by:** direction (collision backoff), AutoBrake (forward/back obstacle checks).

**Today (duplicated in both transformers):**
```javascript
const right = api.vec.normalize(api.vec.cross(forward, [0, 1, 0]));
// … loop offsets along right, api.raycast per origin, pick closest hit …
```

**Proposed:**
```typescript
api.raycastSpread(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  spreadWidth: number,   // total sideways span (rays from -width/2 to +width/2)
  rayCount: number,      // number of parallel rays (1 = center only)
  options?: { visualize?: boolean; hitColor?: string; missColor?: string },
): RaycastResult
```

Always returns a `RaycastResult` (same as `api.raycast`); use `.hit` and `.distance`. Closest hit wins; if none hit, returns the center-ray result (current fallback behavior).

---

### 2. `api.vec.offsetAlong` — point along a direction

**What it does:** `origin + direction * distance` (direction need not be normalized; distance is in metres).

**Used by:** AutoBrake (`frontPosition`, `backdPosition`); direction (`frontPosition` for backoff ray).

**Today:**
```javascript
api.vec.add(input.position, api.vec.scale(forward, 5))
```

**Proposed:**
```typescript
api.vec.offsetAlong(origin: Vec3, direction: Vec3, distance: number): Vec3
```

---

### 3. `api.vec.angleBetween` — unsigned angle between directions

**What it does:** Angle in radians from `from` to `to`, in range **0 … π**. Handles numeric drift (clamps dot product before `acos`).

**Used by:** direction (how far off-target before slowing for a turn).

**Today:**
```javascript
let dot = api.vec.dot(forward, inputToTarget);
dot = Math.max(-1, Math.min(1, dot));
let angle = Math.acos(dot);
```

**Proposed:**
```typescript
api.vec.angleBetween(from: Vec3, to: Vec3): number
```

Inputs should be normalized for stable results (callers already normalize after `projectOntoPlane`).

---

### 4. `api.vec.signedAngleAroundAxis` — left/right turn angle

**What it does:** Signed angle in radians from `from` to `to` **around** `axis` (e.g. entity up). Positive/negative tells you turn left vs right (same idea as checking `cross(forward, toTarget)[1]` on flat ground).

**Used by:** direction (`input.actions.steering_angle = ±angle`).

**Today:**
```javascript
let angle = Math.acos(clampedDot);
let cross = api.vec.cross(forward, inputToTarget);
if (Math.abs(angle) < 0.001) { /* straight */ }
else if (cross[1] > 0) input.actions.steering_angle = angle;
else input.actions.steering_angle = -angle;
```

**Proposed:**
```typescript
api.vec.signedAngleAroundAxis(from: Vec3, to: Vec3, axis: Vec3): number
```

Returns **0** when vectors are parallel (within epsilon). Use with horizontal vectors and `axis = api.getUpVector(input.rotation)` on slopes.

---

### 5. `api.vec.rightFromForward` — sideways direction for ray fan

**What it does:** Unit vector perpendicular to `forward`, lying in the plane defined by `forward` and `upHint` (defaults to world up `[0, 1, 0]`). This is the “right” axis used to offset spread ray origins.

**Used by:** inside `raycastSpread` implementation; today inlined as `normalize(cross(forward, [0,1,0]))`.

**Today:**
```javascript
const right = api.vec.normalize(api.vec.cross(forward, [0, 1, 0]));
```

**Proposed:**
```typescript
api.vec.rightFromForward(forward: Vec3, upHint?: Vec3): Vec3
```

Pass `api.getUpVector(input.rotation)` when `forward` is slope-relative.

---

## Intentionally out of scope (stay in transformer code)

Keep these as **game logic** in `direction` / `AutoBrake`, not as API helpers:

| Pattern | Why not API |
|---------|-------------|
| `driveAway` / `backOff` / timer `isOn()` / `trigger()` | Stateful behavior; use `state` or plain objects in the transformer. |
| Speed tiers (`maxSpeed`, `approachDist`, throttle when `targetSpeed > currentSpeed`) | Tuning and AI policy, not geometry. |
| `breakSpeed = f(distance, speed²)` in AutoBrake | One-off formula; compose with `api.clamp` and raycast distance. |
| `findCorrectionVector` (Umlenker) | Multi-ray + preference logic; belongs in a separate transformer note if needed later. |
| `calculateApproachActions`, `findClearDirection`, `createTimerState` | High-level; removed from this doc. |

---

## How the two transformers would read (sketch)

**direction** (steering fragment only):
```javascript
const forward = api.getForwardVector(input.rotation);
const up = api.getUpVector(input.rotation);
const toTarget = api.vec.normalize(
  api.vec.projectOntoPlane(api.vec.subtract(targetPos, input.position), up),
);
const flatForward = api.vec.normalize(api.vec.projectOntoPlane(forward, up));
const angle = api.vec.angleBetween(flatForward, toTarget);
const signed = api.vec.signedAngleAroundAxis(flatForward, toTarget, up);
// … speed / throttle policy stays here …
```

**AutoBrake** (forward probe):
```javascript
const forward = api.getForwardVector(input.rotation);
const speed = api.vec.getForwardSpeed(input.velocity, forward);
const front = api.vec.offsetAlong(input.position, forward, 5);
const hit = api.raycastSpread(front, forward, (speed * speed) / 300, 2, 8, { visualize: true });
// … brake strength from hit.distance stays here …
```

---

## Implementation priority

| Priority | API | Rationale |
|----------|-----|-----------|
| 1 | `raycastSpread` | Removes the largest duplicated block in both transformers. |
| 2 | `offsetAlong` | Tiny helper; clarifies “probe point ahead of car”. |
| 3 | `signedAngleAroundAxis` | Removes error-prone cross-product sign check in direction. |
| 4 | `angleBetween` | Small sugar over dot + acos. |
| 5 | `rightFromForward` | Mainly for `raycastSpread` internals; optional to expose. |

**Already shipped:** `api.vec.projectOntoPlane`, `api.vec.rotateAroundAxis`, `api.raycast(..., { visualize })`.

---

## Status

**Implemented** in runtime (`customCodeTransformer.ts`, `vec3.ts`, `raycastSpread.ts`), Monaco decls, and hunt world `direction` / `AutoBrake` migrated off local `multiRaycast`.
