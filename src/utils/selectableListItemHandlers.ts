import type { MouseEventHandler } from 'react'

export type SelectableListItemHandlers = {
  onClick: MouseEventHandler
  onDoubleClick: MouseEventHandler
}

/**
 * List rows where a single click selects and a double click confirms the dialog primary action
 * (Add, Apply, Load, Link, etc.).
 *
 * Use when the footer exposes a primary action that requires a prior selection.
 * Do not use for multi-select checklists, immediate single-click pickers, or flows that need
 * extra configuration after selecting a row.
 */
export function selectableListItemHandlers(
  onSelect: () => void,
  onConfirm: () => void,
): SelectableListItemHandlers {
  return {
    onClick: () => onSelect(),
    onDoubleClick: () => {
      onSelect()
      onConfirm()
    },
  }
}
