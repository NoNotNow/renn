import type { RennWorld } from '@/types/world'

export const sampleWorld: RennWorld = {
  version: '1.0',
  world: {
    gravity: [0, -9.81, 0],
    ambientLight: [0.3, 0.3, 0.35],
    skyColor: [0.4, 0.6, 0.9],
    camera: { mode: 'follow', target: 'ball', distance: 8, height: 2 },
  },
  assets: {},
  entities: [
    {
      id: 'ground',
      bodyType: 'static',
      shape: { type: 'plane' },
      position: [0, 0, 0],
      material: { color: [0.3, 0.5, 0.3] },
    },
    {
      id: 'ball',
      bodyType: 'dynamic',
      shape: { type: 'sphere', radius: 0.5 },
      position: [0, 2, 0],
      mass: 1,
      restitution: 0.8,
      scripts: { onCollision: 'scoreGoal' },
    },
  ],
  scripts: {
    scoreGoal: "game.log('Goal!');",
  },
}
