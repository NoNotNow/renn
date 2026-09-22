# Handoff: IntelliJ inspection XML cleanup (2026-09-22)

## Baseline after wave 2 (L2)

- `npx vitest run` → **250 files passed, 2081 passed | 3 skipped**
- `npx tsc --noEmit -p tsconfig.app.json` → **clean (exit 0)**
- Uncommitted diff grew on top of prior ~102 files (eslint splits, hook deps, test-helper trim, launch.json, migrate script)

## Completed in wave 2 (queue items 1–5)

### 1. Eslint.xml (src)

- **react-hooks/exhaustive-deps**: `PropertyPanel`, `SceneView` (imperative handle, runtime handle bag refs, pixel ratio), `TransformerCustomCodeEditor`, `useEntityListFilters`, `WorkspaceScriptsTab`, `WorkspaceGlobalScriptPanel`, `useDebouncedCompileErrorDisplay` (`useCallback` + deps).
- **Intentional eslint-disable** (documented): `TransformerPipelineHorizontal` trace brief reset; `Builder.workspacePersistence.integration.test.tsx` mount-only mock effect.
- **react-refresh/only-export-components**: split non-component exports into `anchoredPopoverStyles.ts`, `layout/sidebarLayout.ts`, `pipeNav/transformerPipeNavStorage.ts`, `utils/entityExplorerGroupActions.ts`; hooks moved to `useCopyMenu.ts` + `copyMenuContext.ts`, `useEditorUndo.ts` + `editorUndoContextState.ts`; providers stay in `CopyContext.tsx` / `EditorUndoContext.tsx`.
- **@typescript-eslint/no-unused-vars**: removed unused `resolveBuilderDevUrl` import in `tools/renn-mcp/agent-dev-attach.ts`.

### 2. ES6ConvertVarToLetConst

- **No remaining `var` in `src/`** (prior L3 batch). XML remainder is **`playwright-report/**`** — skipped.

### 3. JsonStandardCompliance + JSUnresolvedReference

- **`.vscode/launch.json`**: removed VS Code comment lines (strict JSON).
- **`scripts/migrate-hunt-raycast-api.mjs`**: bracket access for `car_tf1_copy` transformer id (IntelliJ unresolved property).
- **JSUnresolvedReference** in `playwright-report/**` — skipped.

### 4. LossyEncoding.xml

- All 12 paths are **`.renn-agent-browser-profile/**` LevelDB logs** (binary, not UTF-8 text). **No repo source change** — exclude profile dir from IDE scope or gitignore locally.

### 5. JSUnusedGlobalSymbols (safe test/helper)

- Removed unused exports / dead helpers in `src/test/fixtures/minimalVideoMp4.ts`, `src/test/helpers/{entity,mocks,physics,react,three,transformer,world}.ts` (kept actively imported exports).
- **Not touched**: agent MCP session exports, `gameApi.ts` interfaces, `MaterialEditor`, preset transformer fields — need usage audit before export removal.

## Explicitly skipped (unchanged)

- `playwright-report/**`, `node_modules/**`, `dist/**`, `.renn-agent-browser-profile/**`
- `DuplicatedCode*.xml`, `VulnerableLibrariesLocal.xml`, `.cursor/plans/**`
- SpellChecking / Grazie (except prior agent-context table work)

## Next queue (priority)

1. **JSUnusedGlobalSymbols** (~remaining src/agent, `gameApi.ts`, component tests) — `@internal`, drop export, or wire usage; never delete MCP/public surface without repo-wide grep.
2. **agent-context** Grazie/SpellChecking (low).
3. Re-run IntelliJ export after scope excludes browser profile + playwright-report; confirm Eslint.xml empty for `src/`.

## Suggested L3 batches (if chaining)

| Worker | OWNED FILES |
|--------|-------------|
| E | `src/agent/logicVerificationMcpSession.ts`, `logicVerificationBrowserProtocol.ts`, `agentDevProjectBundleServer.ts` — unused export triage only |
| F | `src/scripts/gameApi.ts`, `MaterialEditor.tsx` — unused types/methods |
| G | Docs: Grazie pass on remaining `agent-context/*.md` |

## RISK

- Hook dependency expansions (`SceneView`, workspace script selection) can change effect timing — smoke Builder scripts tab + scene fullscreen if regressions reported.
- Context hook import path churn (`useCopyMenu`, `useEditorUndo`) — all tests green; watch for duplicate casing files on case-sensitive CI.

**LEFTOVER** — see Next queue above.

**RISK** — hook timing; MCP export policy for unused symbols.
