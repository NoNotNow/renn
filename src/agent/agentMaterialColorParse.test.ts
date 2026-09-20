import { describe, it, expect } from 'vitest'
import { parseAgentMaterialColorInput } from '@/agent/agentMaterialColorParse'

describe('parseAgentMaterialColorInput', () => {
  it('parses hex green', () => {
    expect(parseAgentMaterialColorInput('#00ff00')).toEqual([0, 1, 0, 1])
  })

  it('parses rgb tuples', () => {
    expect(parseAgentMaterialColorInput([0.2, 0.4, 0.6])).toEqual([0.2, 0.4, 0.6, 1])
  })
})
