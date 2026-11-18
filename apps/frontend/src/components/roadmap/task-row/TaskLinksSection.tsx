'use client'

import { useState, type FormEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  getGitHubTaskLinkLabel,
  isUiGitHubTaskLink,
  parseGitHubTaskLinkForUi,
} from '@/lib/github-links'
import type { Task, TaskExternalLink } from '@/types/roadmap'

interface TaskLinksSectionProps {
  task: Task
  readOnly: boolean
  adding: boolean
  canCommit: boolean
  onBeginAdd: () => Promise<boolean>
  onCancelAdd: () => void
  onUpdateLinks: (links: TaskExternalLink[]) => Promise<boolean>
  onRemoveLink: (linkId: string) => Promise<boolean>
}

function createLinkId(): string {
  return `link-${crypto.randomUUID()}`
}

export function TaskLinksSection({
  task,
  readOnly,
  adding,
  canCommit,
  onBeginAdd,
  onCancelAdd,
  onUpdateLinks,
  onRemoveLink,
}: TaskLinksSectionProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const visibleLinks = (task.links ?? []).filter(isUiGitHubTaskLink)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canCommit) return
    const result = parseGitHubTaskLinkForUi(input, createLinkId(), task.links)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const updated = await onUpdateLinks([...(task.links ?? []), result.link])
    if (!updated) return
    setInput('')
    setError(null)
    onCancelAdd()
  }

  const handleRemove = async (linkId: string) => {
    const updated = await onRemoveLink(linkId)
    if (!updated) return
    setError(null)
  }

  const handleCancel = () => {
    setInput('')
    setError(null)
    onCancelAdd()
  }

  return (
    <section className="task-detail-section task-links" aria-labelledby={`task-links-${task.id}`}>
      <div className="task-links-heading">
        <h4 id={`task-links-${task.id}`} className="section-label">GitHub links</h4>
        {!readOnly && !adding && (
          <button
            type="button"
            className="btn sm ghost task-link-add"
            onClick={() => { void onBeginAdd() }}
          >
            <Icon name="plus" size={13} /> Add GitHub link
          </button>
        )}
      </div>

      {visibleLinks.length > 0 && (
        <ul className="task-link-list">
          {visibleLinks.map((link) => (
            <li key={link.id}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                <Icon name="github" size={14} />
                {getGitHubTaskLinkLabel(link)}
                <span
                  className="task-link-repo"
                  title={`${link.owner}/${link.repo}`}
                >
                  {link.owner}/{link.repo}
                </span>
              </a>
              {!readOnly && (
                <button
                  type="button"
                  className="task-link-remove"
                  aria-label={`Remove ${getGitHubTaskLinkLabel(link)}`}
                  onClick={() => { void handleRemove(link.id) }}
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <form className="task-link-form" onSubmit={(event) => { void handleSubmit(event) }}>
          <label htmlFor={`task-link-input-${task.id}`} className="sr-only">
            GitHub issue, pull request, or discussion URL
          </label>
          <input
            id={`task-link-input-${task.id}`}
            className="form-input"
            type="text"
            inputMode="url"
            value={input}
            placeholder="Paste a GitHub issue, PR, or discussion URL"
            autoFocus
            onChange={(event) => {
              setInput(event.target.value)
              setError(null)
            }}
          />
          <div className="task-link-form-actions">
            <button type="button" className="btn sm ghost" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn sm primary" disabled={!canCommit}>
              Save link
            </button>
          </div>
          {error && <p className="task-link-error" role="alert">{error}</p>}
        </form>
      )}
    </section>
  )
}
