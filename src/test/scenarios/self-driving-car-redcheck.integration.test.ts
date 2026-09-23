import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripDirectionUmlDeferral } from '@/test/fixtures/selfDrivingCarWorld'

const canonicalDirectionCode = readFileSync(
  resolve(process.cwd(), 'tools/renn-mcp/patches/direction-v3.js'),
  'utf8',
)

describe('self-driving car red-check (isolated file)', () => {
  it('stripDirectionUmlDeferral removes deferral guard from direction patch', () => {
    const broken = stripDirectionUmlDeferral(canonicalDirectionCode)
    expect(broken).not.toEqual(canonicalDirectionCode)
    expect(canonicalDirectionCode).toContain('Umlenker owns lateral detours')
    expect(broken).not.toContain('Umlenker owns lateral detours')
  })
})
