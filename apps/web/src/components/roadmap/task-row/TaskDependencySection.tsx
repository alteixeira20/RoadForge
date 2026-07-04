import { Icon } from '@/components/ui/Icon'
import type { Task } from '@/types/roadmap'

interface TaskDependencySectionProps {
  dependencies: Task[]
  readOnly: boolean
  onNavigate: (taskId: string) => void
  onUnlink: (taskId: string) => void
}

export function TaskDependencySection({
  dependencies,
  readOnly,
  onNavigate,
  onUnlink,
}: TaskDependencySectionProps) {
  if (dependencies.length === 0) return null

  return (
    <div className="task-detail-section">
      <div className="section-label">Depends on</div>
      <div className="deps">
        {dependencies.map((dependency) => (
          <div
            key={dependency.id}
            className="dep-row"
            onClick={() => onNavigate(dependency.id)}
          >
            <Icon
              name={dependency.done ? 'circle-check' : 'circle'}
              size={14}
              stroke={dependency.done ? 'var(--ink-3)' : 'var(--ember)'}
            />
            <span className="title">{dependency.title}</span>
            <span className="did">{dependency.id}</span>
            <span className={`dst ${dependency.done ? 'done' : 'ready'}`}>
              {dependency.done ? 'done' : 'ready'}
            </span>
            {!readOnly && (
              <button
                className="btn-remove"
                onClick={(event) => {
                  event.stopPropagation()
                  onUnlink(dependency.id)
                }}
                title="Unlink dependency"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
