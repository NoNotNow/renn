import { theme } from '@/config/theme'

export interface TextureDialogFooterProps {
  selectedTextureId?: string
  hasUploadPreview: boolean
  onRemove: () => void
  onCancel: () => void
  onPrimary: () => void
}

/**
 * Bottom action row: Remove (left) + Cancel/Primary (right).
 * The primary button label flips to "Upload & Select" while a preview is staged.
 */
export default function TextureDialogFooter({
  selectedTextureId,
  hasUploadPreview,
  onRemove,
  onCancel,
  onPrimary,
}: TextureDialogFooterProps) {
  const hasSelection = !!selectedTextureId
  const primaryEnabled = hasSelection || hasUploadPreview
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        borderTop: `1px solid ${theme.border.default}`,
      }}
    >
      <button
        type="button"
        onClick={onRemove}
        disabled={!hasSelection}
        style={{
          padding: '8px 16px',
          background: hasSelection ? theme.bg.destructive : theme.bg.surface,
          border: hasSelection
            ? `1px solid ${theme.border.destructive}`
            : `1px solid ${theme.border.default}`,
          color: hasSelection ? theme.text.destructive : theme.text.disabled,
          borderRadius: 6,
          cursor: hasSelection ? 'pointer' : 'not-allowed',
          fontSize: 12,
        }}
      >
        Remove Texture
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: `1px solid ${theme.border.default}`,
            color: theme.text.muted,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={!primaryEnabled}
          style={{
            padding: '8px 16px',
            background: primaryEnabled ? theme.feedback.successBg : theme.bg.surface,
            border: primaryEnabled
              ? `1px solid ${theme.feedback.successBorder}`
              : `1px solid ${theme.border.default}`,
            color: primaryEnabled ? theme.feedback.successText : theme.text.disabled,
            borderRadius: 6,
            cursor: primaryEnabled ? 'pointer' : 'not-allowed',
            fontSize: 12,
          }}
        >
          {hasUploadPreview ? 'Upload & Select' : 'Select'}
        </button>
      </div>
    </div>
  )
}
