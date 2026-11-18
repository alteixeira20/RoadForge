import { Icon } from '@/components/ui/Icon'

interface TaskDetailActionsProps {
  showChildActions: boolean
  onEditDetails: () => void
  onAddSubtask: () => void
  onLinkDependency: () => void
}

export function TaskDetailActions({
  showChildActions,
  onEditDetails,
  onAddSubtask,
  onLinkDependency,
}: TaskDetailActionsProps) {
  return (
    <div className="actions" role="group" aria-label="Task actions">
      <button
        type="button"
        className="btn sm task-details-action"
        onClick={onEditDetails}
      >
        <Icon name="pencil" size={13} /> Edit details
      </button>
      {showChildActions && (
        <button
          type="button"
          className="btn sm"
          onClick={onAddSubtask}
        >
          <Icon name="plus" size={13} /> Add subtask
        </button>
      )}
      {showChildActions && (
        <button
          type="button"
          className="btn sm"
          onClick={onLinkDependency}
        >
          <Icon name="link" size={13} /> Link dependency
        </button>
      )}
    </div>
  )
}
