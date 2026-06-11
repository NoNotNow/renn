import type { RennWorld, Vec3 } from '@/types/world'
import { DEFAULT_SCALE } from '@/types/world'
import CopyableArea from './CopyableArea'
import { useWorldPanelEdits } from './world/useWorldPanelEdits'
import WorldSimulationSection from './world/WorldSimulationSection'
import WorldGravitySection from './world/WorldGravitySection'
import WorldSleepSection from './world/WorldSleepSection'
import WorldDistanceCullingSection from './world/WorldDistanceCullingSection'
import WorldSkySection from './world/WorldSkySection'
import WorldFogSection from './world/WorldFogSection'
import WorldLightSection from './world/WorldLightSection'
import WorldGroundSection from './world/WorldGroundSection'

export interface WorldPanelProps {
  world: RennWorld
  onWorldChange: (world: RennWorld) => void
}

/**
 * World tab container. Holds nothing of its own beyond the section composition
 * and a copyable JSON snapshot — each section owns its state, helpers, and
 * `world.world.*` patches via the shared `useWorldPanelEdits` hook.
 */
export default function WorldPanel({ world, onWorldChange }: WorldPanelProps) {
  const edits = useWorldPanelEdits(world, onWorldChange)
  const copyPayload = buildCopyPayload(world)

  return (
    <div style={{ padding: 10 }}>
      <CopyableArea copyPayload={copyPayload}>
        <WorldSimulationSection world={world} edits={edits} />
        <WorldGravitySection world={world} edits={edits} />
        <WorldSleepSection world={world} edits={edits} />
        <WorldDistanceCullingSection world={world} edits={edits} />
        <WorldSkySection world={world} onWorldChange={onWorldChange} edits={edits} />
        <WorldFogSection world={world} edits={edits} />
        <WorldLightSection world={world} edits={edits} />
        <WorldGroundSection world={world} onWorldChange={onWorldChange} edits={edits} />
      </CopyableArea>
    </div>
  )
}

function buildCopyPayload(world: RennWorld) {
  const groundEntity = world.entities.find((e) => e.shape?.type === 'plane')
  const groundColor: Vec3 = groundEntity?.material?.color
    ? (groundEntity.material.color.slice(0, 3) as Vec3)
    : [0.3, 0.5, 0.3]
  const groundScale: Vec3 = groundEntity?.scale ?? DEFAULT_SCALE
  const skyboxId = world.world.skybox?.trim() ?? ''

  return {
    world: world.world,
    skybox: skyboxId || undefined,
    groundEntity: groundEntity
      ? {
          id: groundEntity.id,
          name: groundEntity.name,
          scale: groundScale,
          material: {
            color: groundColor,
            roughness: groundEntity.material?.roughness ?? 0.5,
            metalness: groundEntity.material?.metalness ?? 0,
            opacity: groundEntity.material?.opacity ?? 1,
          },
          friction: groundEntity.friction ?? 0.5,
        }
      : null,
  }
}
