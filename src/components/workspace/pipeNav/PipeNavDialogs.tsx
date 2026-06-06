import NamePipeDialog from './NamePipeDialog'

export interface PipeNavDialogsProps {
  nameDialog: { title: string; name: string } | null
  onNameChange: (name: string) => void
  onNameConfirm: () => void
  onNameCancel: () => void
}

export default function PipeNavDialogs({
  nameDialog,
  onNameChange,
  onNameConfirm,
  onNameCancel,
}: PipeNavDialogsProps) {
  return (
    <NamePipeDialog
      open={nameDialog != null}
      title={nameDialog?.title ?? ''}
      name={nameDialog?.name ?? ''}
      onNameChange={onNameChange}
      onConfirm={onNameConfirm}
      onCancel={onNameCancel}
    />
  )
}
