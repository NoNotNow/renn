import { describe, expect, it, vi } from 'vitest'
import { addMonacoTypescriptExtraLib } from './monacoExtraLib'

describe('addMonacoTypescriptExtraLib', () => {
  it('adds the same extra lib to typescriptDefaults and javascriptDefaults and disposes both', () => {
    const tsDispose = vi.fn()
    const jsDispose = vi.fn()
    const monaco = {
      languages: {
        typescript: {
          typescriptDefaults: {
            addExtraLib: vi.fn((_c: string, _u: string) => ({ dispose: tsDispose })),
          },
          javascriptDefaults: {
            addExtraLib: vi.fn((_c: string, _u: string) => ({ dispose: jsDispose })),
          },
        },
      },
    }

    const handle = addMonacoTypescriptExtraLib(
      monaco as Parameters<typeof addMonacoTypescriptExtraLib>[0],
      'declare const x: number;',
      'ts:test-lib.d.ts',
    )

    expect(monaco.languages.typescript.typescriptDefaults.addExtraLib).toHaveBeenCalledTimes(1)
    expect(monaco.languages.typescript.typescriptDefaults.addExtraLib).toHaveBeenCalledWith(
      'declare const x: number;',
      'ts:test-lib.d.ts',
    )
    expect(monaco.languages.typescript.javascriptDefaults.addExtraLib).toHaveBeenCalledTimes(1)
    expect(monaco.languages.typescript.javascriptDefaults.addExtraLib).toHaveBeenCalledWith(
      'declare const x: number;',
      'ts:test-lib.d.ts',
    )

    tsDispose.mockClear()
    jsDispose.mockClear()
    handle.dispose()
    expect(tsDispose).toHaveBeenCalledTimes(1)
    expect(jsDispose).toHaveBeenCalledTimes(1)
  })
})
