# Transformers Architecture (Agent Guide)

This document defines how to reason about and extend the transformer system.
It is written for LLM/code agents and humans working on movement behavior.

## Core purpose

Transformers convert high-level intent (input, AI, environment responses) into
physics intents. They do not move entities directly.

**Hard rule:** transformers only deliver impulses to physics.

## Mental model

Use this flow when reasoning about the system:

`RawInput -> InputMapping -> TransformInput -> TransformerChain -> TransformOutput -> Physics`

Key ideas:
- A transformer is a small, focused unit that reads `TransformInput`.
- The chain executes transformers in priority order (`lower priority` runs first).
- Outputs are additive across the chain.
- A transformer can set `earlyExit` to stop later stages.

## Architecture

### 1) Transformer contract

A transformer implements:
- `type`: stable identifier
- `priority`: execution order
- `enabled`: runtime gate
- `transform(input, dt)`: pure per-frame computation returning `TransformOutput`

`BaseTransformer` provides utility methods (action lookup, vector helpers) and
keeps implementations small.

### 2) Chain orchestration

`TransformerChain`:
- sorts transformers by `priority`
- skips disabled transformers
- executes each transformer with current accumulated context
- accumulates outputs
- supports `earlyExit`
- returns an empty output when nothing is produced

### 3) Registry and composition

`createTransformer` and `createTransformerChain` build chains from JSON config
(`TransformerConfig`). Unknown/invalid transformers fail gracefully and do not
block other transformers.

## Paradigms to follow

### Intent producer, not state mutator

Transformers compute *what should happen physically* this frame. They must not:
- mutate world/entity state directly
- call physics engine APIs directly
- perform rendering work

### Impulse-first outputs

Even though `TransformOutput` supports `force` and `torque`, author new logic as
impulse-oriented behavior whenever possible:
- treat transformer output as instantaneous physical intent
- prefer `impulse` as the delivery channel to physics
- keep behavior deterministic and frame-local

If legacy code emits `force`/`torque`, keep compatibility unless explicitly
migrating, but do not introduce new side-effectful pathways.

### Small, composable transformers

- one transformer = one responsibility
- compose multiple transformers via chain priority
- avoid monolithic "do everything" transformers
- pass context through accumulated values, not global mutation

## Invariants validated by tests

From `transformer.test.ts` and integration tests:
- priority sorting is deterministic
- additive accumulation works across transformers
- disabled transformers are skipped
- `earlyExit` short-circuits chain execution
- accumulated outputs are visible to downstream transformers
- empty/zero output returns canonical empty result

## Agent checklist before editing

When adding or changing transformer behavior:
1. Preserve execution order semantics (`priority`).
2. Preserve additive behavior and `earlyExit`.
3. Keep transformer logic side-effect free.
4. Deliver physics intent as impulses.
5. Add/adjust tests in `src/transformers/*.test.ts`.

## Anti-patterns

Do not:
- write directly to physics bodies from inside transformers
- combine input mapping, behavior logic, and physics application in one class
- hide cross-frame state that breaks determinism without a clear reason
- bypass chain ordering by hard-coding execution dependencies
