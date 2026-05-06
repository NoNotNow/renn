import type { Monaco } from '@monaco-editor/react'

type ExtraLibDisposable = { dispose(): void }

type MonacoTsNamespace = {
  typescriptDefaults: { addExtraLib(source: string, filePath?: string): ExtraLibDisposable }
  javascriptDefaults: { addExtraLib(source: string, filePath?: string): ExtraLibDisposable }
}

/**
 * Register extra TypeScript/JavaScript lib content for the editor.
 *
 * Monaco runs **separate** language-service defaults for `language="javascript"` vs `typescript`.
 * Extra libs attached only to `typescriptDefaults` are invisible to JavaScript models — which breaks
 * custom transformer IntelliSense (`function transform(input, …)` shadows `declare const input` unless
 * JSDoc + global interfaces resolve on the JS program).
 *
 * Monaco ≥0.55 typings mark the language service as deprecated; the runtime API is unchanged.
 */
export function addMonacoTypescriptExtraLib(
  monaco: Monaco,
  content: string,
  uri: string,
): { dispose(): void } {
  const tsApi = monaco.languages.typescript as unknown as MonacoTsNamespace
  const a = tsApi.typescriptDefaults.addExtraLib(content, uri)
  const b = tsApi.javascriptDefaults.addExtraLib(content, uri)
  return {
    dispose(): void {
      a.dispose()
      b.dispose()
    },
  }
}
