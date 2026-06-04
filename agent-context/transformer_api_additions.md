# Transformer API — low-level additions (hunt world)

> **Status:** All items below are **implemented** in runtime, Monaco decls, and hunt-world `direction` / `AutoBrake`. Author-facing reference: in-app **TransformerDocs** → **API reference** (`transformerApiReference.ts`); prose chapters in `transformerDocs/content/{en,de}/*.md`.

Analysis of the two driving custom transformers in `public/exampleWorlds/hunt/world.json`:

| Transformer | ID | Role |
|-------------|-----|------|
| **direction** | `car_tf4` | Steer and throttle toward `input.target` when the player is not overriding controls. |
| **AutoBrake** | `car_tf1_copy` | Raycast ahead/behind and apply brake/throttle from obstacle distance and forward speed. |

This document records **low-level** building blocks only: vector math, raycasts, and small geometry helpers. High-level AI (approach speed, timers, rerouting) stays in transformer code.

---

## Use existing `api` / `api.vec` (no custom copies)

| Need | API |
|------|-----|
| Forward / up from rotation | `api.getForwardVector(input.rotation)`, `api.getUpVector(input.rotation)` |
| Vector to target, distance | `api.vec.subtract`, `api.vec.length` |
| Horizontal steering on slopes | `api.vec.projectOntoPlane(vec, api.getUpVector(input.rotation))` |
| Unit directions | `api.vec.normalize` |
| Speed along forward | `api.vec.getForwardSpeed(input.velocity, forward)` |
| Speed magnitude | `api.vec.length(input.velocity)` |
| Probe point ahead | `api.vec.offsetAlong(origin, direction, distance)` |
| Single ray + debug line | `api.raycast(origin, direction, maxDistance, { visualize: true, … })` |
| Wide bumper check | `api.raycastSpread(origin, direction, maxDistance, spreadWidth, rayCount, options?)` |
| Turn angle (unsigned / signed) | `api.vec.angleBetween`, `api.vec.signedAngleAroundAxis` |
| Clamp scalars | `api.clamp(value, min, max)` |
| Player input | `api.getAction(input, 'throttle')`, etc. |

**Do not** copy a local `multiRaycast` — use `raycastSpread`.

---

## Implemented helpers (formerly proposed)

| API | Role |
|-----|------|
| `api.raycastSpread(...)` | Parallel rays spread sideways; closest hit wins |
| `api.vec.offsetAlong(origin, direction, distance)` | `origin + direction * distance` |
| `api.vec.angleBetween(from, to)` | Unsigned angle 0 … π |
| `api.vec.signedAngleAroundAxis(from, to, axis)` | Signed turn around axis |
| `api.vec.rightFromForward(forward, upHint?)` | Sideways axis for ray fan |

Also shipped earlier: `api.vec.projectOntoPlane`, `api.vec.rotateAroundAxis`, `api.raycast(..., { visualize })`.

---

## Stay in transformer code (not API)

| Pattern | Why |
|---------|-----|
| `driveAway` / `backOff` / timer state | Stateful behavior → `state` |
| Speed tiers, brake formulas | Game tuning, not geometry |
| `findCorrectionVector` (Umlenker) | Multi-ray preference logic |

---

## Sketch (hunt world style)

**direction** (steering):

```javascript
const forward = api.getForwardVector(input.rotation);
const up = api.getUpVector(input.rotation);
const toTarget = api.vec.normalize(
  api.vec.projectOntoPlane(api.vec.subtract(targetPos, input.position), up),
);
const flatForward = api.vec.normalize(api.vec.projectOntoPlane(forward, up));
const angle = api.vec.angleBetween(flatForward, toTarget);
const signed = api.vec.signedAngleAroundAxis(flatForward, toTarget, up);
```

**AutoBrake** (forward probe):

```javascript
const forward = api.getForwardVector(input.rotation);
const speed = api.vec.getForwardSpeed(input.velocity, forward);
const front = api.vec.offsetAlong(input.position, forward, 5);
const hit = api.raycastSpread(front, forward, (speed * speed) / 300, 2, 8, { visualize: true });
```

Implementation: `customCodeTransformer.ts`, `vec3.ts`, `raycastSpread.ts`.
