'use client'

import { Icon } from '@/components/ui/Icon'
import { dedupeNames, getTaskAssignees } from '@/lib/task-assignment'
import type { Participant, Task } from '@/types/roadmap'

interface TeamPanelProps {
  tasks: Task[]
  participants: Participant[]
  onClose: () => void
}

interface Workload {
  name: string
  role?: string
  tasks: Task[]
}

export function TeamPanel({ tasks, participants, onClose }: TeamPanelProps) {
  const activeParticipants = participants.filter((participant) => !participant.revokedAt)
  const names = dedupeNames([
    ...activeParticipants.map((participant) => participant.displayName),
    ...tasks.flatMap((task) => getTaskAssignees(task)),
  ]).sort((a, b) => a.localeCompare(b))

  const workloads: Workload[] = names.map((name) => ({
    name,
    role: activeParticipants.find((participant) => participant.displayName.toLowerCase() === name.toLowerCase())?.role,
    tasks: tasks.filter((task) => getTaskAssignees(task).some((assignee) => assignee.toLowerCase() === name.toLowerCase())),
  }))

  const unassigned = tasks.filter((task) => getTaskAssignees(task).length === 0)
  const countDone = (items: Task[]) => items.filter((task) => task.done).length
  const countOpen = (items: Task[]) => items.filter((task) => !task.done).length

  return (
    <div className="activity-panel team-panel">
      <div className="panel-head">
        <h3>Team</h3>
        <button className="close-btn" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="panel-body">
        {workloads.length === 0 && unassigned.length === 0 ? (
          <div className="state-msg">
            <Icon name="users" size={24} />
            <p>No assigned tasks yet.</p>
          </div>
        ) : (
          <div className="team-list">
            {workloads.map((workload) => {
              const done = countDone(workload.tasks)
              const open = countOpen(workload.tasks)
              return (
                <section key={workload.name} className="team-group">
                  <div className="team-group-head">
                    <div>
                      <div className="team-name">
                        {workload.name}
                        {workload.role && <span>{workload.role}</span>}
                      </div>
                      <div className="team-counts">
                        {workload.tasks.length} tasks · {done} done · {open} open
                      </div>
                    </div>
                  </div>
                  {workload.tasks.length > 0 ? (
                    <div className="team-tasks">
                      {workload.tasks.map((task) => (
                        <div key={task.id} className={`team-task ${task.done ? 'done' : ''}`}>
                          <span>{task.id}</span>
                          <p>{task.title}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="team-empty">No assigned tasks.</div>
                  )}
                </section>
              )
            })}

            <section className="team-group">
              <div className="team-group-head">
                <div>
                  <div className="team-name">Unassigned</div>
                  <div className="team-counts">
                    {unassigned.length} tasks · {countDone(unassigned)} done · {countOpen(unassigned)} open
                  </div>
                </div>
              </div>
              {unassigned.length > 0 && (
                <div className="team-tasks">
                  {unassigned.map((task) => (
                    <div key={task.id} className={`team-task ${task.done ? 'done' : ''}`}>
                      <span>{task.id}</span>
                      <p>{task.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
