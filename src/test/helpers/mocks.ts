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
    applyForce: vi.fn(),
    applyImpulse: vi.fn(),
  }
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
