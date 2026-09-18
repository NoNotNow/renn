import type { ReactNode } from 'react'

/**
 * Where a `TransformerHorizontalPipeline` is mounted. One variant per real host, so the strip
 * takes a single `scope` prop instead of a spread of layout/chrome escape hatches.
 */
export type StageStripScope =
  /** The entity's flat stage stack — the strip renders its own "+" tile and add dialog. */
  | { kind: 'entityStack' }
  /** A full strip inside pipe navigation — the host owns the "+" button and the add dialog. */
  | {
      kind: 'pipeStrip'
      /** Pipe-navigation focus depth, used for the card tint. */
      depth: number
      renderAddButton: () => ReactNode
      /** Enable cascade for the stage at its index in this strip; absent means all enabled. */
      isStageEnabled?: (indexInStrip: number) => boolean
    }
  /** One stage card embedded in an ordered pipe member strip, between sibling pipe cards. */
  | {
      kind: 'pipeMember'
      depth: number
      /** The card's index in the focused pipe's stage list, kept for labels and trace lookup. */
      stackIndex: number
    }

/** Layout and chrome the strip derives from its scope. Internal to the strip. */
export interface StageStripChrome {
  /** Single embedded card: no lead-in arrow, no connectors, no trailing add slot. */
  inline: boolean
  /** Pipe-navigation depth tint for stage cards; undefined on the entity's flat stack. */
  cardDepth: number | undefined
  /** The strip renders `AddTransformerDialog` itself; otherwise the host owns it. */
  ownsAddDialog: boolean
  /** Host-supplied "+" affordance; undefined means use the strip's default button. */
  renderAddButton: (() => ReactNode) | undefined
  /** Card index override when the scope embeds one stage of a larger stack. */
  embedStackIndex: number | undefined
  /** False when an ancestor pipe scope disables the stage at `indexInStrip`. */
  isStageEnabled: (indexInStrip: number) => boolean
}

const ALWAYS_ENABLED = () => true

export function resolveStageStripChrome(scope: StageStripScope): StageStripChrome {
  if (scope.kind === 'pipeMember') {
    return {
      inline: true,
      cardDepth: scope.depth,
      ownsAddDialog: false,
      renderAddButton: undefined,
      embedStackIndex: scope.stackIndex,
      isStageEnabled: ALWAYS_ENABLED,
    }
  }

  if (scope.kind === 'pipeStrip') {
    return {
      inline: false,
      cardDepth: scope.depth,
      ownsAddDialog: false,
      renderAddButton: scope.renderAddButton,
      embedStackIndex: undefined,
      isStageEnabled: scope.isStageEnabled ?? ALWAYS_ENABLED,
    }
  }

  return {
    inline: false,
    cardDepth: undefined,
    ownsAddDialog: true,
    renderAddButton: undefined,
    embedStackIndex: undefined,
    isStageEnabled: ALWAYS_ENABLED,
  }
}
