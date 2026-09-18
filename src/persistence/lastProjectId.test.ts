import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  LAST_PROJECT_ID_KEY,
  getLastProjectId,
  setLastProjectId,
  clearLastProjectId,
} from './lastProjectId'

function createLocalStorageMock(initial?: Record<string, string>) {
  const storage = new Map<string, string>(Object.entries(initial ?? {}))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
  return storage
}

describe('lastProjectId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('with working localStorage', () => {
    let storage: Map<string, string>

    beforeEach(() => {
      storage = createLocalStorageMock()
    })

    it('uses the renn-last-project-id key', () => {
      expect(LAST_PROJECT_ID_KEY).toBe('renn-last-project-id')
    })

    it('getLastProjectId returns null when unset', () => {
      expect(getLastProjectId()).toBeNull()
    })

    it('setLastProjectId stores the id and getLastProjectId reads it', () => {
      setLastProjectId('proj_123')
      expect(storage.get(LAST_PROJECT_ID_KEY)).toBe('proj_123')
      expect(getLastProjectId()).toBe('proj_123')
    })

    it('clearLastProjectId removes the stored id', () => {
      setLastProjectId('proj_abc')
      clearLastProjectId()
      expect(storage.has(LAST_PROJECT_ID_KEY)).toBe(false)
      expect(getLastProjectId()).toBeNull()
    })
  })

  describe('when localStorage throws', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('disabled')
        },
        setItem: () => {
          throw new Error('quota')
        },
        removeItem: () => {
          throw new Error('disabled')
        },
      })
    })

    it('getLastProjectId returns null', () => {
      expect(getLastProjectId()).toBeNull()
    })

    it('setLastProjectId and clearLastProjectId do not throw', () => {
      expect(() => setLastProjectId('x')).not.toThrow()
      expect(() => clearLastProjectId()).not.toThrow()
    })
  })
})
