# UI infrastructure — shared shells, dialogs, and overlays

**Read this before adding or changing any UI surface** (dialogs, popovers, floating panels, resize handles, backdrop overlays).

Goal: one canonical component per interaction pattern. Avoid bespoke `createPortal` + inline drag/resize logic unless the pattern truly does not fit.

---

## Canonical components

| Pattern | Component | When to use |
|---|---|---|
| **Centered blocking dialog** (backdrop, ESC, body scroll lock) | [`Modal.tsx`](../src/components/Modal.tsx) | Save prompts, asset pickers, conflict resolution, add-transformer wizard, avatar editor, performance booster, video conversion, transformer docs browser |
| **In-host floating panel** (draggable header, edge resize, optional position persistence) | [`WorkspaceFloatingDrawer.tsx`](../src/components/workspace/WorkspaceFloatingDrawer.tsx) | Workspace Watch panel, transformer trace I/O popouts, pipeline **Configure** JSON drawer |
| **Full-screen workspace shell** | [`Workspace.tsx`](../src/components/Workspace.tsx) | Behavior authoring overlay (not a reusable dialog primitive) |
| **Anchor-positioned tool popover** | [`BrushToolPopover.tsx`](../src/components/BrushToolPopover.tsx) | Small anchored panels tied to a toolbar button (color picker, brush radius) |
| **Layout split handle** (not a floating shell) | [`WorkspaceDocsSplit.tsx`](../src/components/workspace/WorkspaceDocsSplit.tsx) | Fixed column divider inside Workspace (Monaco vs. transformer docs) |
| **Editor height handle** (not a floating shell) | [`TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx) | Vertical resize for standalone Monaco blocks (`layout: fixed`) |

### Styling primitives

- **Theme tokens**: [`theme.ts`](../src/config/theme.ts) — colors, z-index; prefer over scattered hex.
- **Shared button/row styles**: [`sharedStyles.ts`](../src/components/sharedStyles.ts).
- **Validated JSON editor**: [`ValidatedJsonTextarea.tsx`](../src/components/ValidatedJsonTextarea.tsx).

---

## Resizable surfaces

| Surface | Infrastructure | Edges |
|---|---|---|
| Watch panel, trace I/O, Configure drawer | `WorkspaceFloatingDrawer` `resizable` | left, right, bottom, both bottom corners |
| Add transformer dialog | `Modal` `resizable` | bottom-right corner only |
| Texture Maker window | Custom in `TextureMaker.tsx` | bottom-right corner (duplicated logic) |
| Modal-based pickers (when `resizable`) | `Modal` | bottom-right corner only |

**Rule:** new **floating in-pane** panels → `WorkspaceFloatingDrawer` with `resizable`. New **modal** dialogs that need resize → `Modal` with `resizable` (corner). Do not copy resize mouse handlers into feature components.

**Left-edge resize:** only `WorkspaceFloatingDrawer` supports left/right/bottom edges. `Modal` grows from bottom-right; extending `Modal` to full edge resize is tracked below.

---

## Decision checklist (new UI work)

1. **Blocking + centered?** → `Modal`.
2. **Floats inside a host element (editor pane, pipeline card)?** → `WorkspaceFloatingDrawer` portaled to that host.
3. **Anchored to a toolbar button, small, no drag?** → extend `BrushToolPopover` pattern or extract a shared `AnchoredPopover` if a third consumer appears.
4. **Column split inside an existing layout?** → dedicated split component (like `WorkspaceDocsSplit`), not a floating drawer.
5. **Needs resize?** → use the shell's built-in `resizable` prop; never add a one-off handle in the feature file.
6. **Position should persist?** → `WorkspaceFloatingDrawer` `positionStorageKey` (today: position only, not size).
7. **Touching styles?** → `theme` + `sharedStyles` first.

---

## Audit backlog — duplication and convergence opportunities

Track status here when consolidating. Update this table whenever a row is fixed or a new duplicate is found.

| Item | Current state | Target | Priority |
|---|---|---|---|
| Modal corner resize vs. drawer edge resize | Two separate implementations (`Modal.tsx`, `WorkspaceFloatingDrawer.tsx`) | Extract shared `usePanelResize` hook or shared resize-handle primitives; optionally extend `Modal` to edge resize | Medium |
| `BrushToolPopover` + `TextureMakerBrushPopover` | Near-duplicate anchored popovers (positioning, outside-click, ESC) | Shared `AnchoredPopover` built on one positioning hook | Medium |
| `BrushToolPopover` hardcoded hex | `#1b1f2a`, `#2f3545` instead of `theme` | Migrate to theme tokens | Low |
| `TextureMaker` window resize | Custom pointer handler + corner handle in `TextureMaker.tsx` | `Modal` `resizable` if UX allows centered modal, or shared resize hook | Low |
| Trace I/O drawers (IN/OUT) | `WorkspaceFloatingDrawer` without `resizable` | Enable `resizable` for parity with Watch / Configure | Low |
| Watch / drawer size persistence | Position persisted via `positionStorageKey`; size resets on close | Extend stored layout to `{ x, y, width?, height? }` | Low |
| `EntitySearchFilterPopover` | Plain `<div>` filter panel (no shell) | OK as inline popover content; wrap in shared anchored popover if a third filter popover appears | Low |
| `Workspace` shell overlay | Custom `createPortal` + backdrop (not `Modal`) | Intentional full-screen shell; do not fold into `Modal` | — |
| `Sidebar` resize | Custom resize on toggle button | Layout-specific; keep separate | — |
| `TransformerCustomCodeEditor` height handle | Editor-specific vertical resize | Keep; not a dialog pattern | — |

---

## Current consumers (reference)

### `Modal`

- `SaveDialog`, `AvatarDialog`, `TransformerDocs`, `TransformerTemplateDialog`
- `AddTransformerDialog` (**resizable**)
- `AssignEntitiesDialog`, `WorkspaceConflictDialog`, `PerformanceBoosterDialog`, `VideoConversionDialog`
- `AssetPickerDialogLayout` (texture/model/sound pickers)

### `WorkspaceFloatingDrawer`

- `TransformerWatchPanel` — **resizable**, position persisted (`rennWorkspaceWatchPanelPos`)
- `TransformerPipelineHorizontal` — trace IN/OUT (non-resizable), Configure JSON (**resizable**)

---

## Related docs

- Workspace shell and Watch: [`feature-workspace.md`](feature-workspace.md)
- Custom transformer overlays: [`feature-coding-custom-transformers.md`](feature-coding-custom-transformers.md)
- Cleanup history: [`codebase-cleanup-audit.md`](codebase-cleanup-audit.md) (shared UI phases)
