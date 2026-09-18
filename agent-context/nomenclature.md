# Nomenclature — Canonical Names

Canonical terms used throughout the transformer/pipe system. Use these names consistently in code, comments, and docs.

---

## Transformer system

| Term | Canonical name | Meaning |
|---|---|---|
| One transformer entry in the pipeline | **stage** | A single `TransformerConfig` / `TransformerDef` stored in `world.transformers` and referenced by ID |
| The ordered array of stage IDs on an entity | **transformer list** | `entity.transformers: string[]` — flattened, runtime-ready cache |
| The world-level map of all stage definitions | **transformer registry** | `world.transformers: Record<string, TransformerDef>` |
| Tunable values stored on a stage definition | **stage params** | `TransformerConfig.params: Record<string, unknown>` — widest scope, acts as defaults |
| The full serialized description of one stage | **stage config** | The entire `TransformerConfig` object (type, priority, enabled, params, code, …) |

---

## Pipe system

| Term | Canonical name | Meaning |
|---|---|---|
| Named, reusable, ordered sequence of stages | **pipe** | `TransformerPipe` in `world.transformerPipes` |
| A pipe whose members include other pipes | **manifold** | `TransformerPipe` with `members` containing `{ kind: 'pipe' }` entries |
| Ordered pipe instances bound to one entity | **pipe stack** | `entity.transformerPipeStack: TransformerPipeBinding[]` |
| One entry on the pipe stack | **binding** | `TransformerPipeBinding` — links a pipe to an entity; carries per-entity scope params |
| The entity-specific params on a stack-root binding | **binding params** | `TransformerPipeBinding.params` — mid-level scope; overrides stage params |
| Entity-specific params for a nested pipe scope within a binding | **scope params** | `TransformerPipeBinding.scopeParams[scopeKey]` — narrowest scope; overrides binding params |
| Stable string key identifying a nested scope | **scope key** | Result of `pipeScopeKeyFromPath(path)` — e.g. `"stack:0/member:pipeId:1"` |
| Three-layer param hierarchy (all scopes together) | **param scopes** | stage params → binding params → scope params (narrower wins) |
| One entity's resolved pipe-tree walk, queryable | **entity stage runtime** | `EntityStageRuntime` from `resolveEntityStageRuntime(world, entity)` in `pipeStageResolve.ts` |
| Which host a stage strip is mounted in | **stage strip scope** | `StageStripScope` in `stageStripScope.ts` — `entityStack` \| `pipeStrip` \| `pipeMember` |

---

## Behavior registry bindings

A **behavior registry** is one of the three id-keyed maps a world carries — `scripts`, `transformers`, `transformerPipes` — named by `WorkspaceOrganizeKind` (`'scripts' | 'transformers' | 'pipes'`). A **binding** is an entity referencing one of their ids: `entity.scripts`, `entity.transformers`, or a `transformerPipeStack` entry (`transformerPipe` for legacy worlds).

`behaviorRegistryBindings(kind)` answers the only two questions the UI asks about bindings, in either direction:

| Query | Answers |
|---|---|
| `entitiesUsing(world, itemId)` | Which entities reference this item, in world order, each listed once — the "used by" lists on Organize cards and the initial selection of the assign dialog |
| `idsSharedBy(entities)` | Which ids **every** one of these entities references — Entity-scope card lists for a multi-selection; `[]` for an empty selection |

One generic implementation reads a per-kind id selector, so the three kinds cannot drift apart. The instances are module-level and stable, so calling `behaviorRegistryBindings(kind)` inside a `useMemo` adds no dependency. Not to be confused with the **global behavior library**, which is the IndexedDB store of project-independent definitions.

Seam tested in `behaviorRegistryBindings.test.ts`.

---

## Stage strip scope

`TransformerHorizontalPipeline` renders in three different hosts, and everything that differs between them is named by one `scope` prop rather than a spread of booleans. `resolveStageStripChrome(scope)` turns it into the layout/chrome values the strip uses internally.

| Scope | Host | What it implies |
|---|---|---|
| `{ kind: 'entityStack' }` | `WorkspaceTransformersTab`, entity with no pipe stack | Strip renders its own `+` tile **and** its own `AddTransformerDialog`; no depth tint |
| `{ kind: 'pipeStrip', depth, renderAddButton, isStageEnabled? }` | `PipeFocusedStrip`, a full level of stages | Host owns the `+` button and `PipeAddDialog`; cards tinted by pipe-nav depth |
| `{ kind: 'pipeMember', depth, stackIndex }` | `PipeFocusedStrip`, one stage between sibling pipe cards | Single embedded card: no lead-in arrow, no connectors, no add slot; `stackIndex` keeps the card's label and trace lookup pointing at the real stage |

`isStageEnabled(indexInStrip)` is indexed **locally to the strip**. `PipeFocusedStrip` adds `flatIndexOffsetForStackBinding` before asking the entity stage runtime — the offset conversion belongs to the host that knows the focus path, not to the strip. See the caveat under *Entity stage runtime*: this query currently always answers `true` for piped entities.

Seam tested in `stageStripScope.test.ts`.

---

## Entity stage runtime

`resolveEntityStageRuntime(world, entity)` walks the entity's pipe tree **once** and returns an `EntityStageRuntime` — merged params plus the enable cascade, queried by flat index, stage id, or nav scope path. Every query is a map lookup; the walk is O(pipes × depth).

| Query | Answers |
|---|---|
| `isScopeEnabled(path)` | Is this nav scope effectively enabled (ancestor cascade applied)? |
| `isStageEnabledAt(flatIndex)` | Enable cascade for a stage at its index in `entity.transformers` |
| `mergedParamsAt(flatIndex)` | Three-scope merged runtime params for that stage |
| `syncedStageIds()` | Ids to write back to `entity.transformers` — **all** stages when the entity has no pipe stack, enabled flatten when piped |
| `runtimeConfigs()` | Merged `TransformerConfig[]` for the transformer chain (enabled stages only), or `null` |

**Hold the snapshot; never call per question.** Callers that need more than one answer must resolve once and query — that is the whole point of the interface. `PipeNavTree` and `PipeFocusedStrip` both `useMemo(() => resolveEntityStageRuntime(world, entity), [world, entity])`, so a tree with N rows costs one walk per render, not N. The predecessor shape — free functions `isPipeScopeEffectivelyEnabled` / `isStageEffectivelyEnabled` / `syncEntityTransformerIdsFromPipeTree` / `resolveEntityTransformerConfigsForRuntime`, each rebuilding the full walk to read one field — made the per-row cost invisible at the call site. Guarded by `PipeNavTree.stageRuntime.test.tsx`.

**`isStageEnabledAt` cannot see a cascade disable on a piped entity.** For a piped entity, `stageContext` only holds stages that survived the flatten, so every in-range index answers `true` and out-of-range answers `true` by default. The honest cascade question for a whole strip is `isScopeEnabled(focusPath)` — all stages inside one focused pipe share the same ancestor chain, so it is one answer, not one per stage. A per-stage query cannot work here at all: a stage's own `enabled: false` also removes it from the flatten, and no index- or id-keyed answer can tell the two causes apart. `isStageEnabledById` used to offer one and was dropped for exactly that reason (it reported `false` for a self-disabled stage, which would have locked the user out of re-enabling it).

---

## Param scope merge rules

All three levels participate in a **merge at chain-build time**:

```
stage params       (lowest priority — defaults)
  ↓ merge
binding params     (mid — per-entity pipe-level overrides)
  ↓ merge
scope params       (highest — per-entity nested-pipe overrides)
  ↓
merged params      (frozen object handed to transformer instance)
```

- **Child (narrower) keys override parent (wider) keys.**
- **Missing keys in narrower scopes are inherited from wider scopes.**
- **Immutability is a convention** — merged params are not `Object.freeze()`d at runtime, but must not be mutated.
- Merge happens once per chain build; the result is stored on the transformer instance — **zero allocation per frame** on the hot path.

### UI editing rule

When a transformer config drawer or pipe params UI is open, it shows and edits **only the local params of the scope being edited** — never the merged result. Saves write back to that scope only:

| What is being edited | Writes to |
|---|---|
| Stage config drawer (params field) | Stage registry entry (`world.transformers[id].params`) |
| Pipe params UI at stack root | `binding.params` |
| Pipe params UI for a nested scope | `binding.scopeParams[scopeKey]` |

Editing the stage registry params affects all entities sharing that stage ID (shared definition). Editing binding/scope params affects only that entity's pipe instance.

### Implementation

Single owner: `src/utils/paramScopes.ts`.

| Export | Role |
|---|---|
| `mergeParamScopeLayers` | Layer merge primitive (later keys win; `undefined` skipped) |
| `resolveLocalScopeParams` | **The** scope projection — local params at a `scopePath`, used by both runtime and editing UI |
| `pipeScopeKeyFromPath`, `isStackRootScopePath` | Scope key + stack-root predicate for writes |

Runtime merged output is built in `pipeStageResolve.ts`: stage params + accumulated `resolveLocalScopeParams(binding, path)` layers via `mergeParamScopeLayers`. Editing UIs (`PipeParamsStrip`, `PipeParamsJsonEditor`) call the same function, so the typed strip, the JSON editor and the runtime cannot disagree.

**One projection, on purpose.** There used to be a second, runtime-only function (`resolveBindingScopeLayerParams`) that decided "is this the stack root?" from the scope *key* (`scopeKey.startsWith('stack:')`) while editing decided it from the *path* (`isStackRootScopePath` — length 1). Those are not equivalent: `pipeScopeKeyFromPath` emits nested keys like `stack:0/member:abc:1`, which also start with `stack:`. So at every nested scope the runtime appended `binding.params` again as a *higher*-priority layer, clobbering any stack-root override back to its binding default — the editing UI showed `speed: 10` while the runtime resolved `speed: 5`.

It was latent, not live: `scopeParams['stack:N']` is never populated today, because `applyPipeParamWorldUpdate` routes stack-root writes to `binding.params`, and nav paths always have exactly one leading `stack` segment, so the bare key `stack:N` can only ever come from a root path. Nothing enforced that, though, and a legacy or hand-edited project file could carry it.

**Resolution:** the duplicate was deleted rather than patched, so the divergence cannot reappear. Safe because the runtime tree walk always pushes the root `stack:N` layer before descending (`visitMembers`; `walkCopyBindingStages` only uses the root key), so `binding.params` is already present in an ancestor layer — dropping the re-injection removes a spurious override and loses nothing. Regression test at the real runtime seam: `pipeStageResolve.test.ts` → `'stack-root scopeParams override wins over binding.params at nested stages'`.
