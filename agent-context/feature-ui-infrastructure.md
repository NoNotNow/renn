# UI infrastructure — shared shells, dialogs, and overlays

**Read this before adding or changing any UI surface** (dialogs, popovers, floating panels, resize handles, backdrop overlays).

Goal: one canonical component per interaction pattern. Avoid bespoke `createPortal` + inline drag/resize logic unless the pattern truly does not fit.

---

## Canonical components

| Pattern                                                                                 | Component                                                                                                                                                                                  | When to use                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Centered blocking dialog** (backdrop, ESC, body scroll lock)                          | [`Modal.tsx`](../src/components/Modal.tsx)                                                                                                                                                 | Save prompts, asset pickers, conflict resolution, add-transformer wizard, avatar editor, performance booster, video conversion, transformer docs browser                                 |
| **In-host floating panel** (draggable header, edge resize, optional layout persistence) | [`WorkspaceFloatingDrawer.tsx`](../src/components/workspace/WorkspaceFloatingDrawer.tsx)                                                                                                   | Workspace Watch panel, transformer trace I/O popouts, pipeline **Configure** JSON drawer, Builder **AV evolution** panel (`AvEvolutionPanel.tsx`, body-portaled)                                                                                                 |
| **Full-screen workspace shell**                                                         | [`Workspace.tsx`](../src/components/Workspace.tsx)                                                                                                                                         | Behavior authoring overlay (not a reusable dialog primitive)                                                                                                                             |
| **Anchor-positioned tool popover**                                                      | [`AnchoredPopover.tsx`](../src/components/AnchoredPopover.tsx) + [`useAnchoredPopover.ts`](../src/hooks/useAnchoredPopover.ts)                                                             | Small anchored panels tied to a toolbar button (brush color/size, etc.)                                                                                                                  |
| **Layout split handle** (not a floating shell)                                          | [`WorkspaceDocsSplit.tsx`](../src/components/workspace/WorkspaceDocsSplit.tsx)                                                                                                             | Fixed column divider inside Workspace (Monaco vs. transformer docs)                                                                                                                      |
| **Inline docked sidebar split**                                                         | [`TransformerPipeNavSidebar.tsx`](../src/components/workspace/pipeNav/TransformerPipeNavSidebar.tsx), [`PipeNavOpenToggle.tsx`](../src/components/workspace/pipeNav/PipeNavOpenToggle.tsx) | Pipe navigation tree in Transformers tab (resizable, **collapsed by default**; slim `»` opener aligned to pipeline strip center; open state persisted in `localStorage`)                 |
| **Pipeline add modal**                                                                  | [`PipeAddDialog.tsx`](../src/components/workspace/pipeNav/PipeAddDialog.tsx), [`AddTransformerDialogPanel.tsx`](../src/components/workspace/AddTransformerDialogPanel.tsx)                 | Unified `+` dialog: transformer preset/existing + create/link/copy pipes (replaces clipped popover)                                                                                      |
| **Pipe nav tree DnD**                                                                   | [`PipeNavTree.tsx`](../src/components/workspace/pipeNav/PipeNavTree.tsx), [`pipeNavEdit.ts`](../src/editor/pipeNavEdit.ts)                                                                 | Sidebar tree reorder/nest/promote; confirmations and invalid-drop warnings go through the injected `PipeNavEditPrompts` (`windowPipeNavPrompts` wraps `window.confirm` / `window.alert`) |
| **Editor height handle** (not a floating shell)                                         | [`TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx)                                                                                                     | Vertical resize for standalone Monaco blocks (`layout: fixed`)                                                                                                                           |

### Shared resize primitives

| Primitive                                  | File                                                                                                                                                                               | Used by                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Bottom-right corner resize (pointer)       | [`useCornerBrResize.ts`](../src/hooks/useCornerBrResize.ts)                                                                                                                        | `Modal`, `TextureMaker` floating window |
| Floating drawer edge resize math + handles | [`floatingDrawerLayout.ts`](../src/components/workspace/floatingDrawerLayout.ts), [`FloatingDrawerResizeHandles.tsx`](../src/components/workspace/FloatingDrawerResizeHandles.tsx) | `WorkspaceFloatingDrawer` |

### Select-then-confirm list rows

| Pattern                                                           | Utility                                                                       | When to use                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Single click selects; double click runs the footer primary action | [`selectableListItemHandlers.ts`](../src/utils/selectableListItemHandlers.ts) | Modal listboxes with **Add**, **Apply**, **Load**, **Link**, etc. after a row is highlighted |

**Use** when one row is selected and a footer button confirms (e.g. [`AddTransformerDialog`](../src/components/workspace/AddTransformerDialog.tsx): double-click preset → Add; double-click existing → Link).

**Do not use** when:

- **Multi-select** checklists ([`AssignEntitiesDialog`](../src/components/workspace/AssignEntitiesDialog.tsx)) — double-click would be ambiguous vs. toggling selection.
- **Immediate pick** flows ([`EntitySearchPicker`](../src/components/entitySearch/EntitySearchPicker.tsx), [`TextureDialog`](../src/components/TextureDialog.tsx), [`ModelDialog`](../src/components/ModelDialog.tsx)) — single click already selects and closes.
- **Configure-then-apply** flows ([`PerformanceBoosterDialog`](../src/components/PerformanceBoosterDialog.tsx)) — row pick is only the first step.
- **Native `<select>`** or mode-choice dialogs (Link vs. Copy buttons only) — no list row to double-click.

Confirm handlers passed to `onConfirm` must use the row id directly (not React selection state), because `setState` from `onSelect` is async.

### Styling primitives

- **Theme tokens**: [`theme.ts`](../src/config/theme.ts) — colors, z-index (`popover`, `popoverElevated`); prefer over scattered hex.
  - **Stacking contract** (guarded by `src/config/theme.zIndex.test.ts`): `header` < `floatingDialog` < `modal` < `menu`. Body-portaled dialogs render ABOVE the top menu (`BuilderHeader`); portaled menus (header `DropdownMenu` panels — portaled to body on open — and the copy context menu) sit above every dialog so menus stay usable while a dialog is open. Body-portaled `WorkspaceFloatingDrawer`s pass `zIndex={theme.zIndex.floatingDialog}`.
- **Shared button/row styles**: [`sharedStyles.ts`](../src/components/sharedStyles.ts).
- **Validated JSON editor**: [`ValidatedJsonTextarea.tsx`](../src/components/ValidatedJsonTextarea.tsx).
- **Anchored popover shell**: [`anchoredPopoverShellStyle`](../src/components/AnchoredPopover.tsx) — `theme.bg.panel` + `theme.border.default`.

---

## Resizable surfaces

| Surface                                  | Infrastructure                        | Edges                                     |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------- |
| Watch panel, trace I/O, Configure drawer | `WorkspaceFloatingDrawer` `resizable` | left, right, bottom, both bottom corners  |
| Add transformer dialog                   | `Modal` `resizable`                   | bottom-right corner (`useCornerBrResize`) |
| Texture Maker window                     | `useCornerBrResize`                   | bottom-right corner                       |
| Modal-based pickers (when `resizable`)   | `Modal`                               | bottom-right corner only                  |

**Rule:** new **floating in-pane** panels → `WorkspaceFloatingDrawer` with `resizable`. New **modal** dialogs that need resize → `Modal` with `resizable`. Do not copy resize mouse handlers into feature components.

---

## Decision checklist (new UI work)

1. **Blocking + centered?** → `Modal`.
2. **Floats inside a host element (editor pane, pipeline card)?** → `WorkspaceFloatingDrawer` portaled to that host.
3. **Anchored to a toolbar button, small, no drag?** → `AnchoredPopover`.
4. **Column split inside an existing layout?** → dedicated split component (like `WorkspaceDocsSplit`), not a floating drawer.
5. **Needs resize?** → use the shell's built-in `resizable` prop or `useCornerBrResize`; never add a one-off handle in the feature file.
6. **Position/size should persist?** → `WorkspaceFloatingDrawer` `positionStorageKey` stores `{ x, y, width?, height? }` when `resizable`.
7. **Touching styles?** → `theme` + `sharedStyles` first.

---

## Audit backlog — duplication and convergence opportunities

Track status here when consolidating. Update this table whenever a row is fixed or a new duplicate is found.

| Item                                            | Status             | Notes                                                                                                                                                                             |
| ----------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal corner resize vs. drawer edge resize      | **Done (partial)** | `useCornerBrResize` shared by `Modal` + `TextureMaker`; drawer uses `floatingDrawerLayout` + `FloatingDrawerResizeHandles`. Full edge resize on `Modal` still optional follow-up. |
| `BrushToolPopover` + `TextureMakerBrushPopover` | **Done**           | Both use `AnchoredPopover` + `useAnchoredPopover`.                                                                                                                                |
| `BrushToolPopover` hardcoded hex                | **Done**           | Shell uses `theme.bg.panel` / `theme.border.default`; CTA uses `theme.button.primary`.                                                                                            |
| `TextureMaker` window resize                    | **Done**           | Uses `useCornerBrResize`.                                                                                                                                                         |
| Trace I/O drawers (IN/OUT)                      | **Done**           | `WorkspaceFloatingDrawer` `resizable` enabled.                                                                                                                                    |
| Watch / drawer size persistence                 | **Done**           | `positionStorageKey` persists `{ x, y, width?, height? }`.                                                                                                                        |
| `EntitySearchFilterPopover`                     | **OK**             | Plain filter content; wrap in `AnchoredPopover` if a third anchored filter popover appears.                                                                                       |
| `Workspace` shell overlay                       | **Intentional**    | Full-screen shell; do not fold into `Modal`.                                                                                                                                      |
| `Sidebar` resize                                | **Intentional**    | Layout-specific toggle resize; keep separate.                                                                                                                                     |
| `TransformerCustomCodeEditor` height handle     | **Intentional**    | Editor-specific vertical resize; not a dialog pattern.                                                                                                                            |
| Extend `Modal` to full edge resize              | **Open (low)**     | Only needed if a centered modal requires left/top edge drag.                                                                                                                      |
| Param editors (pipe strip, 4 JSON textareas)    | **Done**           | One `ParamField` / `ParamForm` / `ParamsJsonEditor` (`src/components/params/`) used by `PipeConfigDrawer`, the stage Configure drawer (Params / JSON tabs), `TransformerEditor` and `WorkspaceGlobalTransformerPanel`. Drawers are the existing `WorkspaceFloatingDrawer`; no new floating infra. Entity-id params use the shared `EntitySearchPicker` inside `ParamField` (`EntityIdControl`, world via `ParamEntityProvider` mounted around the Transformers tab; plain text without it). Open (low): the picker sits in an inline popover under the field, not an `AnchoredPopover`; the `ParamField` row is a `div` for id types (a `label` would forward result clicks). |
| Stage drawer shows stage params, not effective values | **Done** | `StageParamsForm` takes a `paramContext` (pipe layers from `EntityStageRuntime.paramLayersForMember`) and shows effective values with a `from pipe: <layer>` badge; edits go to the winning layer. See feature-transformers.md "Param forms". |
| Training Mazes / Crux / Widen-freeze panel | **Done (2026-10-14 merged; sidebar move 2026-10-15)** | ONE parameterized `MazeTrainingDialog.tsx` serves all three sets via a `trainingSet` prop (`TrainingSet`: worlds, car ids, watch labels, tile texts, `<set>-training-*` testids, per-set candidate localStorage slot) — no copied panel. Since the 2026-10-15 sidebar move it lives as the **Training tab of the right sidebar**: `PropertySidebar` gets a fifth `tabConfig` entry and renders the section node the Builder passes via its `trainingPanel` prop (the Builder owns the training-set state, the play callback, the live run and — lifted out of `PropertySidebar` — the persisted `builderRightSidebarTab` tab state); **File → "Training…" opens the right drawer on the training tab** (no floating dialog anymore). The old floating chrome (body portal, header drag, collapse strip, all-edges resize) was removed together with its single-consumer hook `usePanelEdgeResize.ts` — the shared `floatingDrawerLayout` + `FloatingDrawerResizeHandles` stay in use by `WorkspaceFloatingDrawer`; the obsolete `trainingPanelPos` / `Size` / `Collapsed` localStorage slots are simply no longer written (left in place for old profiles). The set tab bar (Mazes / Crux / Widen-freeze via `TRAINING_SETS` in `trainingSets.ts`, `key`-remount per tab), the model-selector DROPDOWN (2026-10-19, user request — replaces the chips row: ONE native `<select>` in the candidates row lists every exported candidate with `Deployed (export)` as the first option; selecting re-loads a live run right away, accent border marks an active selection; the old collapsible chips row, its toggle and the one-chip summary are GONE — the obsolete `trainingPanelCandidatesCollapsed` / `<set>TrainingPanelCandidatesCollapsed` localStorage slots are simply no longer written, left in place for old profiles like the retired panel slots) + candidate-reactive integer AVERAGES (`Ø Best` / `Ø Worst` via `meanRound`) in that same row under the header, the world rows with health dots and the live-run overlay are unchanged; the route thumbnails measure the section (ResizeObserver; jsdom keeps a 300×600 sidebar-default fallback) through the unchanged `routeTileThumbHeightPx` (40–176 px clamps — no cap tuning needed: ~65 px per tile at the 300 px default sidebar width, 40 px floor at the 180 px minimum). The score-stage code and exporter tooling are shared modules too (`src/policyEvolution/trainingScoreStage.ts`, `tools/renn-mcp/trainingThumbSvg.ts` + `trainingScoreRun.ts`). |
| DropdownMenu body portal + own dismiss effect | **Open (low)** | `DropdownMenu` portals its open panel to `document.body` (needed to escape the header stacking context and stay above dialogs) with its own fixed-position/scroll/resize and outside-click/Escape effect — a third variant besides `useAnchoredPopover` and the pipe-nav tree dismiss. If a fourth appears, extract the shared `useDismissOnOutside` + a shared menu-portal hook. |

---

## Current consumers (reference)

### `Modal`

- `SaveDialog`, `AvatarDialog`, `TransformerDocs`, `TransformerTemplateDialog`
- `AddTransformerDialog` (**resizable** via `useCornerBrResize`)
- `AssignEntitiesDialog`, `WorkspaceConflictDialog`, `PerformanceBoosterDialog`, `VideoConversionDialog`
- `AssetPickerDialogLayout` (texture/model/sound pickers)

### `WorkspaceFloatingDrawer`

- `TransformerWatchPanel` — **resizable**, layout persisted (`rennWorkspaceWatchPanelPos`)
- `TransformerPipelineHorizontal` — trace IN/OUT (**resizable**), Configure JSON (**resizable**)

### `AnchoredPopover`

- `BrushToolPopover` (builder scene brush)
- `TextureMakerBrushPopover` (studio brush; `closeOnEscape={false}` — parent handles Escape stack)

---

## Related docs

- Workspace shell and Watch: [`feature-workspace.md`](feature-workspace.md)
- Custom transformer overlays: [`feature-coding-custom-transformers.md`](feature-coding-custom-transformers.md)
- Cleanup history: [`codebase-cleanup-audit.md`](codebase-cleanup-audit.md) (shared UI phases)

**Builder sidebars (`layout/Sidebar.tsx`)**: besides the toggle/resize button, an open sidebar has a full-height 8px grab strip on its inner edge (`sidebar-edge-resize-left|right`) that drags the width (no collapse-on-click, unlike the button).

**Audit backlog — dismiss behaviour**: the pipe-nav tree row menu (`PipeNavTree`, "Add before / after / child") has its own outside-click / Escape / scroll dismiss effect, duplicating `useAnchoredPopover`'s. Any new popup, menu or row action must close on outside click and Escape; consider extracting a shared `useDismissOnOutside` and switching the tree to it.
