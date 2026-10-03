import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AddTransformerDialogPanel from './AddTransformerDialogPanel'
import type { TransformerConfig } from '@/types/transformer'

describe('AddTransformerDialogPanel global library tab', () => {
  const globals = { g_wander: { type: 'custom', name: 'AV Wander (random goals)', priority: 2.5, code: '' } as TransformerConfig }

  it('lists global transformers and adds the selected one', () => {
    const onAddGlobal = vi.fn()
    render(
      <AddTransformerDialogPanel existingRegistry={{}} excludedIds={[]} onAddPreset={() => {}} onAddExisting={() => {}} globalTransformers={globals} onAddGlobal={onAddGlobal} onCancel={() => {}} />,
    )
    fireEvent.click(screen.getByTestId('add-transformer-tab-global'))
    fireEvent.click(screen.getByTestId('add-transformer-global-g_wander'))
    fireEvent.click(screen.getByTestId('add-transformer-add-preset'))
    expect(onAddGlobal).toHaveBeenCalledWith('g_wander')
  })

  it('hides the tab when no global library is wired', () => {
    render(<AddTransformerDialogPanel existingRegistry={{}} excludedIds={[]} onAddPreset={() => {}} onAddExisting={() => {}} onCancel={() => {}} />)
    expect(screen.queryByTestId('add-transformer-tab-global')).toBeNull()
  })
})
