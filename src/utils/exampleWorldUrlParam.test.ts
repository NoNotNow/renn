import { describe, expect, it } from 'vitest'
import {
  readExampleWorldUrlParam,
  readExampleWorldUrlState,
  withExampleWorldUrlParam,
  withExampleWorldUrlState,
} from './exampleWorldUrlParam'

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

describe('exampleWorldUrlState', () => {
  it('reads entity and tool only next to an example id', () => {
    expect(readExampleWorldUrlState('?example=w&entity=e1&tool=visualize')).toEqual({
      example: 'w',
      entity: 'e1',
      tool: 'visualize',
    })
    expect(readExampleWorldUrlState('?entity=e1&tool=visualize')).toEqual({ example: null, entity: null, tool: null })
  })

  it('writes and clears entity / tool, keeping other params', () => {
    const full = withExampleWorldUrlState('https://x.io/renn/?a=1', { example: 'w', entity: 'e 1', tool: 'visualize' })
    expect(readExampleWorldUrlState(new URL(full).search)).toEqual({ example: 'w', entity: 'e 1', tool: 'visualize' })
    expect(withExampleWorldUrlState(full, { example: 'w', entity: null, tool: 'translate' })).toBe(
      'https://x.io/renn/?a=1&example=w&tool=translate',
    )
    expect(withExampleWorldUrlParam(full, 'other')).toBe('https://x.io/renn/?a=1&example=other')
    expect(withExampleWorldUrlState(full, { example: null, entity: 'e', tool: 'paint' })).toBe('https://x.io/renn/?a=1')
  })
})
