import type { ReactNode } from 'react'
import Modal from '@/components/Modal'
import { theme } from '@/config/theme'

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  background: theme.bg.panelAlt,
  border: `1px solid ${theme.border.default}`,
  color: theme.text.primary,
  fontSize: 14,
}

export interface AssetPickerDialogLayoutProps {
  isOpen: boolean
  onClose: () => void
  title: string
  searchPlaceholder: string
  searchQuery: string
  onSearchChange: (query: string) => void
  assetList: ReactNode
  uploadPanel: ReactNode
  footer: ReactNode
  width?: number
  height?: number
}

/**
 * Shared shell for texture/model asset picker dialogs.
 * Pins search (subheader) and actions (footer); only the left asset list column scrolls.
 */
export default function AssetPickerDialogLayout({
  isOpen,
  onClose,
  title,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  assetList,
  uploadPanel,
  footer,
  width = 800,
  height = 600,
}: AssetPickerDialogLayoutProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={width}
      height={height}
      contentOverflow="hidden"
      subheader={
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={searchPlaceholder}
          data-testid="asset-picker-search"
          style={searchInputStyle}
        />
      }
      footer={<div data-testid="asset-picker-footer">{footer}</div>}
    >
      <div
        data-testid="asset-picker-body"
        style={{
          display: 'flex',
          gap: 16,
          flex: 1,
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {assetList}
        {uploadPanel}
      </div>
    </Modal>
  )
}
