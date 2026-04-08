import type { Monaco } from '@monaco-editor/react'

/**
 * Register extra TypeScript/JavaScript lib content for the editor.
 * Monaco ≥0.55 typings mark the language service as deprecated; the runtime API is unchanged.
 */
export function addMonacoTypescriptExtraLib(
  monaco: Monaco,
  content: string,
  uri: string,
): { dispose(): void } {
  const ts = monaco.languages.typescript as unknown as {
    typescriptDefaults: { addExtraLib(source: string, filePath?: string): { dispose(): void } }
  }
  return ts.typescriptDefaults.addExtraLib(content, uri)
}
