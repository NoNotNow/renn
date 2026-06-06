import Modal from '@/components/Modal'
import AddTransformerDialogPanel, {
  type AddExistingTransformerMode,
  type AddTransformerDialogPanelProps,
} from '@/components/workspace/AddTransformerDialogPanel'

export type { AddExistingTransformerMode }

export interface AddTransformerDialogProps extends Omit<AddTransformerDialogPanelProps, 'onCancel'> {
  isOpen: boolean
  onClose: () => void
}

export default function AddTransformerDialog({
  isOpen,
  onClose,
  existingRegistry,
  excludedIds,
  onAddPreset,
  onAddExisting,
}: AddTransformerDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add transformer"
      width={720}
      height={640}
      minWidth={480}
      minHeight={420}
      resizable
    >
      <AddTransformerDialogPanel
        existingRegistry={existingRegistry}
        excludedIds={excludedIds}
        onAddPreset={(type) => {
          onAddPreset(type)
          onClose()
        }}
        onAddExisting={(registryId, mode) => {
          onAddExisting(registryId, mode)
          onClose()
        }}
        onCancel={onClose}
      />
    </Modal>
  )
}
