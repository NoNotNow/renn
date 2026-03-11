import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { clearIndexedDBCache } from './clearCache'

describe('clearCache', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, reload: vi.fn() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes renn-worlds IndexedDB database', async () => {
    const deleteDatabaseSpy = vi.spyOn(indexedDB, 'deleteDatabase')
    const request = {
      onsuccess: null as ((this: IDBOpenDBRequest, ev: Event) => void) | null,
      onerror: null as ((this: IDBOpenDBRequest, ev: Event) => void) | null,
      error: null as DOMException | null,
    }
    deleteDatabaseSpy.mockReturnValue(request as unknown as IDBOpenDBRequest)

    const p = clearIndexedDBCache()
    expect(deleteDatabaseSpy).toHaveBeenCalledWith('renn-worlds')
    request.onsuccess?.call(request as unknown as IDBOpenDBRequest, new Event('success'))
    await p
    expect(window.location.reload).toHaveBeenCalled()
  })
})
