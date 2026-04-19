# Feature: Rigging — Concept & Roadmap (Phase B)

This document is **concept only**. No code is shipped in Phase B yet — it captures the
plan agreed in the `groups-and-rigging` plan so the implementation can start in
B-MVP-sized iterations after review.

Phase A (already shipped) introduced organizational [Explorer Groups](feature-groups.md).
Phase B turns a group into a **rig**: a set of Rapier joints connecting its member
entities, with a dedicated UI for joint editing.

> **Performance warning (read this twice):** every joint is solved each physics frame.
> Adding rigging will measurably impact the Rapier solver — especially closed-loop
> graphs and spring joints. We **must** run [`performance-benchmarks.integration.test.ts`](../src/test/scenarios/performance-benchmarks.integration.test.ts)
> before shipping `B-Spring` and `B-Graph`. See [`performance-work.md`](performance-work.md).

---

## B.1 Comparative analysis

How other tools expose joints/constraints. Bullet form (no markdown table on purpose —
keeps tokens lean).

- **Blender — Rigid Body Constraints**
  - Constraint types: `Fixed`, `Point`, `Hinge`, `Slider`, `Piston`, `Generic`,
    `Generic Spring`, `Motor`.
  - Constraint lives on an **Empty** acting as the pivot anchor; the Empty references
    two rigid bodies (`Object1`, `Object2`).
  - Lives in a per-object Constraints panel; auto-computed pivots from the Empty's
    transform.
  - **Strength:** anchor placement is a familiar transform (move the Empty to set the
    pivot). Easy multi-body rigs.
  - **Weakness:** constraints scattered across the outliner; finding "all joints in
    rig X" requires manual tagging.

- **Unity — Joint components**
  - Types: `FixedJoint`, `HingeJoint`, `SpringJoint`, `ConfigurableJoint`,
    `CharacterJoint`.
  - Joint lives **on the body that wants to be constrained**; `Connected Body` field
    links the partner. `ConfigurableJoint` exposes per-axis motion locks + drives.
  - **Strength:** joints follow their owning body in the hierarchy (familiar component
    pattern); inspector shows everything in one place.
  - **Weakness:** asymmetry (joint lives on A, not B) confuses beginners; multi-joint
    rigs require navigating to each body.

- **Unreal — Physics Constraint Actor**
  - Constraint is its own **Actor**, references two `Component`s by name.
  - Linear and Angular limits in separate tabs; Drives (Motor + Spring) per axis.
  - **Strength:** very explicit, separates linear/angular concerns.
  - **Weakness:** verbose UI; high learning curve.

- **Godot — Joint3D Nodes**
  - Types: `PinJoint3D`, `HingeJoint3D`, `SliderJoint3D`, `Generic6DOFJoint3D`.
  - Joints are **Scene Nodes**, typically as siblings of the connected bodies.
  - **Strength:** joints visible in the scene tree; can be parented/grouped freely.
  - **Weakness:** tree gets crowded for complex rigs.

- **Roblox — Constraints**
  - Types: `WeldConstraint`, `RopeConstraint`, `HingeConstraint`, `SpringConstraint`,
    `BallSocketConstraint`.
  - **Attachment-first model:** each body gets `Attachment` instances; constraints link
    two attachments. UI lets you place attachments visually in the editor.
  - **Strength:** beginner-friendly, explicit anchor visualization.
  - **Weakness:** more boilerplate (every joint requires two `Attachment` objects).

### Evaluation axes

| Axis | What we want |
|------|--------------|
| Discoverability | "Where is the joint?" must be answerable in one click |
| Data location | Joints belong to a rig (group), not scattered across entities |
| Multi-body rigs | Adding the 5th joint must not feel painful |
| Learning curve | Two-body case (story 2: fixed weld) is the first thing the user sees |

### Decision for Renn

Closest to **Roblox** (attachment-first, single panel) combined with **Godot**'s scene
locality (joints belong to the rig group, not to a body):

- Joints live inside the group's `rig.joints` array (single source of truth per rig).
- Anchor points (`anchorA`, `anchorB`) are local-space `Vec3`s on each connected body —
  no separate `Attachment` object, but conceptually the same.
- The Rig-Editor in PropertySidebar lists every joint of the active rig. No hunting
  through entities.

---

## B.2 User story → Rapier joint mapping

Rapier 3D ([rapier.rs/docs](https://rapier.rs/docs/user_guides/javascript/joints)) ships
`FixedJoint`, `SphericalJoint`, `RevoluteJoint`, `PrismaticJoint`, and `GenericJoint`
(per-DOF lock / limit / spring / motor). All joints are **paired** (Body A ↔ Body B).

| User story | Joint type | Notes |
|-----------|-----------|-------|
| **1. Trailer hitch** (item A hangs from B) | `SphericalJoint` | 3 free rotations, position pinned at the hitch anchor. Optional `GenericJoint` with yaw/pitch limits if the user wants a constrained ball joint. |
| **2. Rigid weld** (A welded to B) | `FixedJoint` | Trivial; chosen as **B-MVP** because it's the easiest to validate end-to-end. |
| **3. Rubber/elastic** (A↔B with damping) | `GenericJoint` with all DOF set to *free + spring* (per-axis stiffness + damping). Fallback: a custom **spring transformer** that applies a Hooke-law force if Rapier's spring API proves too restrictive at scale. |
| **4. Multi-body, mixed connections** | Multiple paired joints in the same `rig.joints[]`. Joints do **not** know about each other; the rig groups them. UI must list them clearly. |
| **5. Triangle/graph** (A↔B, A↔C, B↔C) | Three paired joints. **Solver caveat**: closed loops can over-constrain Rapier's iterative solver, leading to jitter. Document clearly; add a `cycle detected` warning in the editor. |

### Joint anchor convention

- `anchorA`, `anchorB` are **local-space** `Vec3` offsets from each body's center.
- Default to `[0,0,0]` (body centers) when omitted — matches Rapier's defaults and
  avoids surprises.
- Anchor gizmos in the viewport (Phase B-Hitch+ ) are a major UX win but a non-trivial
  cost; deferred to a later iteration.

---

## B.3 UI concept (proposal — to discuss)

### Group → Rig toggle

In the Explorer (`EntityExplorerTree`):

- New small icon on the group row: **toggle "Rig mode"**. When on, the group icon
  changes (e.g. `📁` → `🦴`), and the group's `rig` field is initialized.
- Toggling rig mode off clears `rig` (with a confirm dialog if joints exist).

### Rig-Editor panel

New PropertySidebar tab — **"Rig"** — appears when the selected group has `rig` set.

Layout:

1. **Joints list** at top: one row per joint, showing type icon, A↔B labels, and a
   delete button. Selected joint highlighted.
2. **"Add joint" dropdown** below: type picker (Fixed | Hitch (Spherical) |
   Hinge (Revolute) | Slider (Prismatic) | Spring (Generic)). Creates a draft joint
   pre-populated with the two currently-selected entities (if exactly two members are
   selected).
3. **Joint inspector** for the selected joint:
   - Body A / Body B dropdowns (limited to the rig's members)
   - Anchor A / Anchor B `Vec3` inputs (local space on each body)
   - Type-specific fields:
     - `revolute`/`prismatic`: `axis: Vec3`, optional `limits: [min, max]`
     - `spring`: `stiffness`, `damping`, optional `restLength`
     - `spherical`: optional `coneLimit`
4. **Viewport feedback**: a thin line + small icon between the connected bodies' world
   anchors. Selected joint highlighted in the gizmo color.

### Templates / presets

Following the **Transformer-Presets** pattern (`src/data/transformerPresets/`):

- `src/data/rigPresets/` with JSON files per template:
  - `trailer-hitch.json` — Spherical joint with sensible cone limits
  - `rigid-weld.json` — Fixed joint at body centers
  - `spring.json` — Generic spring with mid-range stiffness/damping
- "Load preset" button in the Rig-Editor's add-joint dropdown.

### Save / load

`rig` round-trips automatically through `RennWorld.groups[].rig` (already validated
in Phase A as opaque content). Joint-rebuild on world load: a small post-load hook
turns each `RigJoint` into a Rapier joint after bodies are created.

---

## B.4 Data model sketch (NOT to implement yet)

```ts
// Phase A already declared `rig?: RigConfig` on EntityGroup as an opaque placeholder.
// Phase B fills it in with these definitions.

export interface RigConfig {
  joints: RigJoint[]
}

export type RigJoint =
  | FixedRigJoint
  | SphericalRigJoint
  | RevoluteRigJoint
  | PrismaticRigJoint
  | SpringRigJoint

interface BaseRigJoint {
  id: string
  bodyA: string         // entity ID inside the rig
  bodyB: string         // entity ID inside the rig
  anchorA?: Vec3        // local on A; defaults to [0,0,0]
  anchorB?: Vec3        // local on B; defaults to [0,0,0]
}

interface FixedRigJoint     extends BaseRigJoint { type: 'fixed' }
interface SphericalRigJoint extends BaseRigJoint { type: 'spherical'; coneLimit?: number }
interface RevoluteRigJoint  extends BaseRigJoint { type: 'revolute';  axis: Vec3; limits?: [number, number] }
interface PrismaticRigJoint extends BaseRigJoint { type: 'prismatic'; axis: Vec3; limits?: [number, number] }
interface SpringRigJoint    extends BaseRigJoint {
  type: 'spring'
  stiffness: number
  damping: number
  restLength?: number
}
```

Schema additions (Phase B): a new `$defs/RigConfig` and `$defs/RigJoint` (oneOf union).
Phase A's opaque `rig` definition is replaced by the typed shape; **older worlds with
opaque rigs become invalid until migrated**, so Phase B begins with a `migrateRigs()`
step that strips unknown joint types and warns.

---

## B.5 Roadmap (iterative)

1. **B-MVP — `FixedJoint` only (story 2)**
   - Group rig toggle + `RigConfig` typed schema (replaces opaque placeholder)
   - PropertySidebar "Rig" tab with joint list + add/delete (Fixed only)
   - Viewport line gizmo for selected joint
   - Persistence + undo + load-time joint rebuild
   - Smoke test: two boxes welded; in Play, they fall together as one body

2. **B-Hitch — `SphericalJoint` (story 1)**
   - Add `spherical` joint type, anchor inputs become required
   - Optional cone-limit field
   - **No** anchor viewport gizmos yet (still typed `Vec3` only)

3. **B-Hinge / B-Slider — `RevoluteJoint`, `PrismaticJoint`**
   - `axis: Vec3` field with helper buttons (X/Y/Z)
   - Limit inputs `[min, max]`

4. **B-Spring — `GenericJoint` spring (story 3)**
   - Stiffness / damping inputs
   - **Performance pass mandatory** before merging (see warning at top)

5. **B-Graph — multi-joint rigs (stories 4 & 5)**
   - Cycle detection in the rig graph + warning surface in the editor
   - Add a "rig graph" mini-visualization in the panel (nodes = bodies, edges = joints)

6. **B-Templates — joint presets**
   - Mirror the Transformer-Presets workflow

7. **B-Anchors (stretch) — viewport gizmos for `anchorA`, `anchorB`**
   - High UX value, sizeable implementation cost; landed last so the data model is
     stable.

---

## B.6 Open questions (do not block Phase A)

1. **Where do joints live in the world doc?**
   - Current proposal: nested in `groups[].rig.joints` (decided).
   - Alternative considered: top-level `joints[]` keyed by group ID. Rejected
     because it creates a second source of truth and complicates undo.

2. **What if a joined body is `static`?**
   - Rapier accepts the case, but the UX needs a clear "anchored to world" symbol on
     the joint row.

3. **Should joints survive entity duplication?**
   - When the user clones one body of a joint, do we offer to "replicate the joint
     with the clone"? Likely **no** for B-MVP; revisit after user feedback.

4. **Anchor-point gizmos in the viewport?**
   - Big UX win, but parents on the existing `TransformControls` infrastructure. Track
     as `B-Anchors` (stretch goal).

5. **Performance budget?**
   - Need a measured budget (e.g. "≥ 60 FPS on a 50-entity world with up to 30
     joints"). Define numbers in the B-MVP perf pass.

---

## Cross-references

- [`feature-groups.md`](feature-groups.md) — Phase A foundation
- [`performance-work.md`](performance-work.md) — perf pass requirements
- [`feature-transformers.md`](feature-transformers.md) — alternative force model for
  story 3 (custom spring transformer fallback)
- [`architecture.md`](architecture.md) — overall structure and where the Rig-Editor
  would slot into PropertySidebar
