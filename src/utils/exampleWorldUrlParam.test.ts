import { describe, expect, it } from 'vitest'
import { readExampleWorldUrlParam, withExampleWorldUrlParam } from './exampleWorldUrlParam'

describe('exampleWorldUrlParam', () => {
  it('reads the example id from the query', () => {
    expect(readExampleWorldUrlParam('?example=self_hunt_flexible')).toBe('self_hunt_flexible')
    expect(readExampleWorldUrlParam('?example=%20')).toBeNull()
    expect(readExampleWorldUrlParam('')).toBeNull()
  })

  it('sets and removes the param, keeping other params', () => {
    const set = withExampleWorldUrlParam('https://x.io/renn/?a=1', 'world1')
    expect(set).toBe('https://x.io/renn/?a=1&example=world1')
    expect(readExampleWorldUrlParam(new URL(set).search)).toBe('world1')
    expect(withExampleWorldUrlParam(set, null)).toBe('https://x.io/renn/?a=1')
  })
})
