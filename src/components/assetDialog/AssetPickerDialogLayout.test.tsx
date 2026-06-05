import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssetPickerDialogLayout from '@/components/assetDialog/AssetPickerDialogLayout'

describe('AssetPickerDialogLayout', () => {
  it('pins search, body, and footer in separate modal regions', () => {
    render(
      <AssetPickerDialogLayout
        isOpen
        onClose={vi.fn()}
        title="Select Texture"
        searchPlaceholder="Search textures…"
        searchQuery=""
        onSearchChange={vi.fn()}
        assetList={<div data-testid="asset-list">List</div>}
        uploadPanel={<div data-testid="upload-panel">Upload</div>}
        footer={<button type="button">Select</button>}
      />,
    )

    expect(screen.getByTestId('asset-picker-search')).toBeInTheDocument()
    expect(screen.getByTestId('asset-picker-body')).toBeInTheDocument()
    expect(screen.getByTestId('asset-picker-footer')).toBeInTheDocument()
    expect(screen.getByTestId('asset-list')).toBeInTheDocument()
    expect(screen.getByTestId('upload-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })
})
