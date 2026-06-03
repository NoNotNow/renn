import { describe, expect, test } from 'vitest'
import { transformerCtxDecl } from './transformerCodeDecl'

describe('transformerCtxDecl', () => {
  test('ambient declare const restores legacy-body IntelliSense', () => {
    const decl = transformerCtxDecl()
    expect(decl).toContain('declare const input: TransformInput')
    expect(decl).toContain('declare const dt: number')
    expect(decl).toContain('declare const params: Record<string, unknown>')
    expect(decl).toContain('declare const state: Record<string, unknown>')
    expect(decl).toContain('declare const api: TransformerRuntimeApi')
  })

  test('TransformFn alias documents full signature including return type', () => {
    const decl = transformerCtxDecl()
    expect(decl).toMatch(/type\s+TransformFn\b/)
    expect(decl).toMatch(/TransformerRuntimeApi/)
    expect(decl).toMatch(/TransformOutput/)
  })

  test('TransformerRuntimeApi lists every runtime helper including getAction and log', () => {
    const decl = transformerCtxDecl()
    expect(decl).toMatch(/interface\s+TransformerRuntimeApi\b[\s\S]*\bgetAction\b/)
    expect(decl).toMatch(/interface\s+TransformerRuntimeApi\b[\s\S]*\blog\s*\(message/i)
    expect(decl).toContain('durationSeconds?: number')
    expect(decl).toContain('getUpVector')
    expect(decl).toContain('addVec3')
    expect(decl).toContain('subtractVec3')
    expect(decl).toContain('normalizeVec3')
    expect(decl).toContain('getEntity')
    expect(decl).toContain('LiveWorldEntity')
    expect(decl).toContain('getLivePosition')
    expect(decl).toContain('getWorldPosition')
    expect(decl).toContain('getStartPosition')
    expect(decl).toContain('visualizeLine')
    expect(decl).toContain('visualize?: boolean')
    expect(decl).toContain('hitColor?: string')
    expect(decl).not.toContain('visualizeCoordinate')
  })

  test('TransformerVecApi documents projectOntoPlane and rotateAroundAxis', () => {
    const decl = transformerCtxDecl()
    expect(decl).toMatch(/interface\s+TransformerVecApi\b[\s\S]*\bprojectOntoPlane\b/)
    expect(decl).toMatch(/interface\s+TransformerVecApi\b[\s\S]*\brotateAroundAxis\b/)
    expect(decl).toMatch(/interface\s+TransformerVecApi\b[\s\S]*\boffsetAlong\b/)
    expect(decl).toMatch(/interface\s+TransformerRuntimeApi\b[\s\S]*\braycastSpread\b/)
  })

  test('environment field docs match authoring concerns (touching vs grounded vs support)', () => {
    const decl = transformerCtxDecl()
    expect(decl).toMatch(/interface\s+EnvironmentState\b[\s\S]*\/\*/)
    expect(decl).toContain('supportVelocity')
    expect(decl).toContain('isGrounded')
  })

  test('declare const params JSDoc reminds authors to cast JSON values', () => {
    const decl = transformerCtxDecl()
    expect(decl).toContain('Params JSON')
    expect(decl).toContain('Number(params')
    expect(decl).toContain('declare const params: Record<string, unknown>')
  })
})
