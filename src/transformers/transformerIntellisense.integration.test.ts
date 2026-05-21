/**
 * Asserts Transformer Monaco `.d.ts` + JSDoc on `transform()` produce useful completions
 * for `input.` and `api.` using the same TypeScript language service Monaco uses under the hood.
 */
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { defaultCustomTransformerCode } from './customCodeTransformer'
import { transformerCtxDecl, TRANSFORMER_CODE_EXTRA_LIB_URI } from './transformerCodeDecl'

const USER_PATH = '/transformer-user.js'

function createLanguageServiceForUserJs(userSource: string): ts.LanguageService {
  const fileContents = new Map<string, string>([
    [TRANSFORMER_CODE_EXTRA_LIB_URI, transformerCtxDecl()],
    [USER_PATH, userSource],
  ])

  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.None,
    noEmit: true,
    skipLibCheck: true,
  }

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...fileContents.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const text = fileContents.get(fileName)
      return text != null ? ts.ScriptSnapshot.fromString(text) : undefined
    },
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (name) => fileContents.has(name) || ts.sys.fileExists(name),
    readFile: (name) => fileContents.get(name) ?? ts.sys.readFile(name),
    directoryExists: (path) => ts.sys.directoryExists(path),
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  }

  return ts.createLanguageService(host, ts.createDocumentRegistry())
}

function completionNames(
  lang: ts.LanguageService,
  fileName: string,
  position: number,
): ReadonlySet<string> {
  const list = lang.getCompletionsAtPosition(fileName, position, {
    includeExternalModuleExports: false,
    includeInsertTextCompletions: false,
    triggerCharacter: '.',
    triggerKind: ts.CompletionTriggerKind.TriggerCharacter,
  })
  if (list == null || list.entries == null) return new Set()
  return new Set(list.entries.map((e) => e.name))
}

function positionAfter(source: string, needle: string): number {
  const i = source.indexOf(needle)
  expect(i).toBeGreaterThanOrEqual(0)
  return i + needle.length
}

describe('transformer IntelliSense (TS language service)', () => {
  test('default skeleton: input. and api. offer TransformInput and TransformerRuntimeApi members', () => {
    const base = defaultCustomTransformerCode()
    const source = base.replace(
      `  //your code goes here
  return {  };`,
      `  const _in = input.
  void api.
  return {  };`,
    )
    const lang = createLanguageServiceForUserJs(source)

    const inputDot = completionNames(lang, USER_PATH, positionAfter(source, 'const _in = input.'))
    expect(inputDot.has('actions')).toBe(true)
    expect(inputDot.has('environment')).toBe(true)
    expect(inputDot.has('velocity')).toBe(true)
    expect(inputDot.has('entityId')).toBe(true)

    const apiDot = completionNames(lang, USER_PATH, positionAfter(source, 'void api.'))
    expect(apiDot.has('log')).toBe(true)
    expect(apiDot.has('getAction')).toBe(true)
    expect(apiDot.has('getForwardVector')).toBe(true)
    expect(apiDot.has('scaleVec3')).toBe(true)
    expect(apiDot.has('getEntity')).toBe(true)
    expect(apiDot.has('getWorldPosition')).toBe(true)
    expect(apiDot.has('getStartPosition')).toBe(true)
    expect(apiDot.has('visualizeLine')).toBe(true)
    expect(apiDot.has('visualizeCoordinate')).toBe(false)
  })

  test('legacy global `input` body: input. resolves from declare const', () => {
    const source = `input.actions
return {};`
    const lang = createLanguageServiceForUserJs(source)

    const names = completionNames(lang, USER_PATH, positionAfter(source, 'input.'))
    expect(names.has('actions')).toBe(true)
    expect(names.has('environment')).toBe(true)
  })

  test('full function without JSDoc: input parameter is implicit any; completions omit typed members', () => {
    const source = `function transform(input, dt, params, state, api) {
  input.
  return {};
}`
    const lang = createLanguageServiceForUserJs(source)
    const names = completionNames(lang, USER_PATH, positionAfter(source, 'function transform(input, dt, params, state, api) {\n  input.'))
    expect(names.has('actions')).toBe(false)
  })

  test('full function with inline param @type: input. / api. get typed completions', () => {
    const source = `function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  const _in = input.
  void api.
  return {};
}`
    const lang = createLanguageServiceForUserJs(source)
    const inputNames = completionNames(lang, USER_PATH, positionAfter(source, 'const _in = input.'))
    expect(inputNames.has('actions')).toBe(true)

    const apiNames = completionNames(lang, USER_PATH, positionAfter(source, 'void api.'))
    expect(apiNames.has('getAction')).toBe(true)
    expect(apiNames.has('clamp')).toBe(true)
    expect(apiNames.has('getEntity')).toBe(true)
    expect(apiNames.has('getWorldPosition')).toBe(true)
    expect(apiNames.has('getStartPosition')).toBe(true)
  })

  test('LiveWorldEntity from api.getEntity offers getLivePosition', () => {
    const source = `function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  const target = api.getEntity('box');
  if (!target) return {};
  target.
  return {};
}`
    const lang = createLanguageServiceForUserJs(source)
    const names = completionNames(
      lang,
      USER_PATH,
      positionAfter(source, 'if (!target) return {};\n  target.'),
    )
    expect(names.has('getLivePosition')).toBe(true)
    expect(names.has('id')).toBe(true)
  })
})
