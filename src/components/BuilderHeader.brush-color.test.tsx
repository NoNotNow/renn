import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import type { ProjectMeta } from '@/persistence/types'
import BuilderHeader from './BuilderHeader'
import { TEXTURE_PAINT_RADIUS_PX } from '@/editor/transformGizmoController'

const noop = (): void => {}

async function openBrushPopover(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Brush tool' }))
}

describe('BuilderHeader texture brush color', () => {
  const baseProps = {
    projects: [] as ProjectMeta[],
    currentProject: { id: null as string | null, name: 'Test', isDirty: false },
    shadowsEnabled: true,
    onNew: noop,
    onSave: noop,
    onSaveAs: noop,
    onExport: noop,
    onCopyWorld: noop,
    onImport: noop,
    onOpen: noop,
    onRefresh: noop,
    onReload: noop,
    onDeleteProject: noop,
    onPlay: noop,
    onShadowsChange: noop,
    onFileChange: noop as (e: React.ChangeEvent<HTMLInputElement>) => void,
    onResetCamera: noop,
    fileInputRef: createRef<HTMLInputElement>(),
  }

  it('shows brush color controls in a floating popover after clicking the brush tool in paint mode', async () => {
    const user = userEvent.setup()
    const onColor = vi.fn()
    const onRadius = vi.fn()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="paint"
        onGizmoModeChange={noop}
        textureBrushDisabled={false}
        textureBrushColorHex="#ff0000"
        onTextureBrushColorHexChange={onColor}
        textureBrushRadiusPx={TEXTURE_PAINT_RADIUS_PX}
        onTextureBrushRadiusPxChange={onRadius}
      />,
    )
    await openBrushPopover(user)
    const input = screen.getByTestId('texture-brush-color')
    expect(input).toBeInTheDocument()
    expect(input.tagName.toLowerCase()).toBe('input')
    expect(input).toHaveValue('#ff0000')
    expect(screen.getByTestId('brush-tool-popover')).toBeInTheDocument()
  })

  it('does not show brush popover until the brush tool is clicked', () => {
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="translate"
        onGizmoModeChange={noop}
        textureBrushDisabled={false}
        textureBrushColorHex="#ff0000"
        onTextureBrushColorHexChange={noop}
      />,
    )
    expect(screen.queryByTestId('texture-brush-color')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brush-tool-popover')).not.toBeInTheDocument()
  })

  it('calls onTextureBrushColorHexChange when hex input changes', async () => {
    const user = userEvent.setup()
    const onColor = vi.fn()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="paint"
        onGizmoModeChange={noop}
        textureBrushDisabled={false}
        textureBrushColorHex="#000000"
        onTextureBrushColorHexChange={onColor}
        textureBrushRadiusPx={TEXTURE_PAINT_RADIUS_PX}
        onTextureBrushRadiusPxChange={noop}
      />,
    )
    await openBrushPopover(user)
    fireEvent.change(screen.getByTestId('texture-brush-color'), { target: { value: '#00ff00' } })
    expect(onColor).toHaveBeenCalledWith('#00ff00')
  })

  it('shows brush size slider in popover when radius handler is provided', async () => {
    const user = userEvent.setup()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="paint"
        onGizmoModeChange={noop}
        textureBrushDisabled={false}
        textureBrushColorHex="#000000"
        onTextureBrushColorHexChange={noop}
        textureBrushRadiusPx={42}
        onTextureBrushRadiusPxChange={noop}
      />,
    )
    await openBrushPopover(user)
    const slider = screen.getByTestId('texture-brush-size')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('min', '1')
    expect(slider).toHaveAttribute('max', '800')
    expect(slider).toHaveValue('42')
  })

  it('calls onTextureBrushAlphaChange when opacity slider changes', async () => {
    const user = userEvent.setup()
    const onAlpha = vi.fn()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="paint"
        onGizmoModeChange={noop}
        textureBrushDisabled={false}
        textureBrushColorHex="#000000"
        onTextureBrushColorHexChange={noop}
        textureBrushAlpha={0.5}
        onTextureBrushAlphaChange={onAlpha}
        textureBrushRadiusPx={TEXTURE_PAINT_RADIUS_PX}
        onTextureBrushRadiusPxChange={noop}
      />,
    )
    await openBrushPopover(user)
    fireEvent.change(screen.getByTestId('texture-brush-opacity'), { target: { value: '0.8' } })
    expect(onAlpha).toHaveBeenCalledWith(0.8)
  })

  it('selects paint mode and opens popover when brush is clicked from another gizmo', async () => {
    const user = userEvent.setup()
    const onMode = vi.fn()
    render(
      <BuilderHeader
        {...baseProps}
        gizmoMode="translate"
        onGizmoModeChange={onMode}
        textureBrushDisabled={false}
        textureBrushColorHex="#ff0000"
        onTextureBrushColorHexChange={noop}
        textureBrushRadiusPx={TEXTURE_PAINT_RADIUS_PX}
        onTextureBrushRadiusPxChange={noop}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Brush tool' }))
    expect(onMode).toHaveBeenCalledWith('paint')
    expect(screen.getByTestId('brush-tool-popover')).toBeInTheDocument()
  })
})
