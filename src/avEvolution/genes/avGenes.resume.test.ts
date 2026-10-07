import { describe, expect, it } from 'vitest'
import { AV_SPEC_VERSION, avSpecResumeError } from './avGenes'

describe('avSpecResumeError', () => {
  it('accepts the current spec version only; v2 runs (pre maze genes) are rejected', () => {
    expect(AV_SPEC_VERSION).toBe('3')
    expect(avSpecResumeError(AV_SPEC_VERSION)).toBeUndefined()
    expect(avSpecResumeError('2')).toMatch(/gene spec v2.*current spec is v3/)
    expect(avSpecResumeError('1')).toBeDefined()
  })
})
