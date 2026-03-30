import { vi } from 'vitest'
import type { GameAPI } from '@/scripts/gameApi'
import type { uiLogger } from '@/utils/uiLogger'

/**
 * Create a mock GameAPI for testing
 */
export function createMockGameAPI(): GameAPI {
  return {
    time: { current: 0, delta: 0 },
    getEntity: vi.fn().mockReturnValue(null),
    getPosition: vi.fn().mockReturnValue(null),
    setPosition: vi.fn(),
    getRotation: vi.fn().mockReturnValue(null),
    setRotation: vi.fn(),
    getUpVector: vi.fn().mockReturnValue(null),
    getForwardVector: vi.fn().mockReturnValue(null),
    resetRotation: vi.fn(),
    addVectorToPosition: vi.fn(),
    setColor: vi.fn(),
    getColor: vi.fn().mockReturnValue(null),
    applyForce: vi.fn(),
    applyImpulse: vi.fn(),
    setTransformerEnabled: vi.fn(),
    setTransformerParam: vi.fn(),
    log: vi.fn(),
    snackbar: vi.fn(),
    setScore: vi.fn(),
    getScore: vi.fn().mockReturnValue(0),
    setDamage: vi.fn(),
    getDamage: vi.fn().mockReturnValue(0),
  } as unknown as GameAPI
}

/**
 * Create a mock uiLogger for testing
 */
export function createMockUILogger(): typeof uiLogger {
  return {
    change: vi.fn(),
    delete: vi.fn(),
    click: vi.fn(),
    log: vi.fn(),
    select: vi.fn(),
    upload: vi.fn(),
  }
}
