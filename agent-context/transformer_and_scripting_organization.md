# Transformer and Scripting Organization

## Transformer Assignment and Storage
- **Registry-based Architecture**: All transformers (both built-in presets and user-authored custom ones) are stored in a world-level registry: `RennWorld.transformers`, which is a `Record<string, TransformerDef>`.
- **Entity Reference**: Entities do not store transformer configurations inline. The `entity.transformers` field contains an array of IDs (strings) that reference the registry.
- **Runtime Resolution**: At runtime, the `RenderItemRegistry` resolves these IDs against the world registry to instantiate a `TransformerChain` for each entity.

## Creation and Reuse Workflows
- **Builder Defaults**: In the current Builder UI, adding or editing transformers typically generates unique IDs per entity (e.g., `car_tf0`, `pedestrian_tf0`). This ensures that edits to one entity's behavior are isolated.
- **Architectural Reuse**: The system supports referencing the same transformer ID across multiple entities. This is achieved by adding the same string ID to the `transformers` array of different entities.
- **Shared Definitions**: When an ID is shared, all referencing entities share the same configuration, including parameters and (for custom transformers) the source code.

## Shared vs. Isolated Behavior (Custom Transformers)
When a custom transformer is reused across multiple entities, the following rules apply:
- **Shared Source Code**: All entities run the exact same compiled JavaScript body.
- **Shared Parameters**: All entities receive the same `params` object from the registry definition.
- **Isolated Runtime Instance**: Each entity receives its own unique **instance** of the `CustomCodeTransformer` class.
- **Isolated State**: The `state` object passed to the `transform` function is a private property of the transformer instance. Consequently, **each entity maintains its own private runtime state**. One entity's script state cannot be read or modified by another entity, even if they share the same transformer definition.

## Disabling Behavior
- **Registry-Level Control**: The `enabled` flag is stored within the transformer definition in the world registry.
- **Global Effect (if shared)**: If multiple entities share the same transformer ID, disabling it in the registry (e.g., via the Builder's "enabled" toggle) will disable it for **all** entities using that ID.
- **Local Effect (if unique)**: When using unique IDs (the Builder default), disabling a transformer only affects the specific entity it belongs to.
- **Execution Lifecycle**: A disabled transformer is completely skipped during the `TransformerChain.execute()` phase. Its code is not run, and it contributes no forces, torques, or pose updates to the entity.

## Comparison with Event Scripts
- **Similar Registry Model**: Like transformers, event-bound scripts (`onSpawn`, `onUpdate`, etc.) are stored in a global registry (`world.scripts`) and referenced by ID in `entity.scripts`.
- **Same Reuse Logic**: Multiple entities can point to the same script. The runtime builds a separate `ctx` for each (entity, event) pair, ensuring that scripts also operate in an isolated manner relative to the entity they are currently driving.
