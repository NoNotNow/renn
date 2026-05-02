import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CodingTabPanel from './CodingTabPanel'
import { EditorUndoProvider } from '@/contexts/EditorUndoContext'
import { CopyProvider } from '@/contexts/CopyContext'
import type { RennWorld } from '@/types/world'

const undoApi = {
  pushBeforeEdit: vi.fn(),
  notifyScrubStart: vi.fn(),
  notifyScrubEnd: vi.fn(),
}

const minimalWorld: RennWorld = {
  version: '1.0',
  world: { gravity: [0, -9.81, 0] },
  assets: {},
  entities: [
    {
      id: 'e1',
      bodyType: 'dynamic',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
      transformers: [
        {
          type: 'custom',
          name: 'Test',
          code: 'return {};',
          priority: 10,
          enabled: true,
          params: {},
        },
      ],
    },
  ],
}

describe('CodingTabPanel', () => {
  it('Code tab exposes custom transformer controls', () => {
    const onWorldChange = vi.fn()
    render(
      <CopyProvider>
        <EditorUndoProvider value={undoApi}>
          <CodingTabPanel
            world={minimalWorld}
            selectedEntityIds={['e1']}
            onWorldChange={onWorldChange}
          />
        </EditorUndoProvider>
      </CopyProvider>,
    )
    fireEvent.click(screen.getByTestId('coding-submenu-code'))
    expect(screen.getByTestId('custom-transformer-select')).toBeInTheDocument()
    expect(screen.getByTestId('custom-transformer-name')).toHaveValue('Test')
  })
})
