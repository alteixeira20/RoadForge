const DEFAULT_API_URL = 'http://localhost:7878'
const REQUEST_TIMEOUT_MS = 15_000

export class RoadForgeApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message)
    this.name = 'RoadForgeApiError'
    this.status = status
    this.payload = payload
  }
}

function optionalEnv(env, name) {
  const value = env[name]?.trim()
  return value || null
}

function apiUrl(env) {
  return (optionalEnv(env, 'ROADFORGE_API_URL') || DEFAULT_API_URL).replace(/\/+$/, '')
}

function inviteToken(env) {
  const raw = optionalEnv(env, 'ROADFORGE_INVITE_TOKEN')
    || optionalEnv(env, 'ROADFORGE_INVITE_URL')
  if (!raw) return null
  if (!raw.includes('://')) return raw
  try {
    return new URL(raw).searchParams.get('token')
  } catch {
    throw new RoadForgeApiError('ROADFORGE_INVITE_URL is not a valid URL')
  }
}

function apiMessage(status, payload) {
  if (typeof payload?.detail === 'string') return payload.detail
  if (typeof payload?.message === 'string') return payload.message
  return `RoadForge API request failed with status ${status}`
}

export function createRoadForgeClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A Fetch API implementation is required')
  }

  let resolvedAuth = null

  async function fetchJson(path, { method = 'GET', body, authorization } = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    timeout.unref?.()

    let response
    try {
      response = await fetchImpl(`${apiUrl(env)}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new RoadForgeApiError('RoadForge API request timed out')
      }
      throw new RoadForgeApiError(`Could not reach the RoadForge API: ${error.message}`)
    } finally {
      clearTimeout(timeout)
    }

    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { detail: text.slice(0, 500) }
      }
    }
    if (!response.ok) {
      throw new RoadForgeApiError(apiMessage(response.status, payload), {
        status: response.status,
        payload,
      })
    }
    return payload
  }

  async function auth() {
    if (resolvedAuth) return resolvedAuth

    const sessionToken = optionalEnv(env, 'ROADFORGE_SESSION_TOKEN')
    if (sessionToken) {
      const roadmapId = optionalEnv(env, 'ROADFORGE_ROADMAP_ID')
      if (!roadmapId) {
        throw new RoadForgeApiError(
          'ROADFORGE_ROADMAP_ID is required with ROADFORGE_SESSION_TOKEN.',
        )
      }
      resolvedAuth = { roadmapId, sessionToken }
      return resolvedAuth
    }

    const token = inviteToken(env)
    if (!token) {
      throw new RoadForgeApiError(
        'Configure ROADFORGE_SESSION_TOKEN and ROADFORGE_ROADMAP_ID, or provide ROADFORGE_INVITE_TOKEN.',
      )
    }
    const joined = await fetchJson('/api/roadmaps/join', {
      method: 'POST',
      body: {
        token,
        display_name: optionalEnv(env, 'ROADFORGE_DISPLAY_NAME') || 'RoadForge Agent',
        ...(optionalEnv(env, 'ROADFORGE_PASSWORD')
          ? { password: optionalEnv(env, 'ROADFORGE_PASSWORD') }
          : {}),
      },
    })
    resolvedAuth = {
      roadmapId: joined.roadmap_id,
      sessionToken: joined.session_token,
    }
    return resolvedAuth
  }

  async function request(path, { method = 'GET', body } = {}) {
    const credentials = await auth()
    return fetchJson(path, {
      method,
      body,
      authorization: credentials.sessionToken,
    })
  }

  async function getRoadmap() {
    const { roadmapId } = await auth()
    return request(`/api/roadmaps/${encodeURIComponent(roadmapId)}`)
  }

  async function currentRevision(expectedUpdatedAt) {
    if (expectedUpdatedAt) return expectedUpdatedAt
    return (await getRoadmap()).updated_at
  }

  async function updateTask(taskId, fields, expectedUpdatedAt) {
    const { roadmapId } = await auth()
    return request(
      `/api/roadmaps/${encodeURIComponent(roadmapId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        body: {
          ...fields,
          last_updated_at: await currentRevision(expectedUpdatedAt),
        },
      },
    )
  }

  async function setTaskDone(taskId, done, expectedUpdatedAt) {
    const { roadmapId } = await auth()
    return request(
      `/api/roadmaps/${encodeURIComponent(roadmapId)}/tasks/${encodeURIComponent(taskId)}/done`,
      {
        method: 'PATCH',
        body: {
          done,
          last_updated_at: await currentRevision(expectedUpdatedAt),
        },
      },
    )
  }

  async function setTaskClaim(taskId, claimed, override = false) {
    const { roadmapId } = await auth()
    const query = override ? '?override=true' : ''
    return request(
      `/api/roadmaps/${encodeURIComponent(roadmapId)}/tasks/${encodeURIComponent(taskId)}/claim${query}`,
      { method: claimed ? 'PATCH' : 'DELETE' },
    )
  }

  async function createTag({ id, label, color, expectedUpdatedAt }) {
    const { roadmapId } = await auth()
    return request(`/api/roadmaps/${encodeURIComponent(roadmapId)}/tags`, {
      method: 'POST',
      body: {
        ...(id ? { id } : {}),
        label,
        ...(color ? { color } : {}),
        last_updated_at: await currentRevision(expectedUpdatedAt),
      },
    })
  }

  return { getRoadmap, updateTask, setTaskDone, setTaskClaim, createTag }
}

export function findTask(roadmap, taskId) {
  for (const phase of roadmap.phases || []) {
    for (const task of phase.tasks || []) {
      if (task.id === taskId) return { phase, task }
    }
  }
  return null
}

function taskFlags(task) {
  const flags = []
  if (task.next) flags.push('next')
  if (task.est) flags.push(`est:${task.est}`)
  if (task.parentId) flags.push(`parent:${task.parentId}`)
  if (task.deps?.length) flags.push(`deps:${task.deps.join(',')}`)
  if (task.tags?.length) flags.push(`tags:${task.tags.join(',')}`)
  if (task.assignees?.length) flags.push(`owners:${task.assignees.join(',')}`)
  return flags.length ? ` | ${flags.join(' | ')}` : ''
}

export function compactRoadmap(roadmap) {
  const phases = roadmap.phases || []
  const tasks = phases.flatMap((phase) => phase.tasks || [])
  const done = tasks.filter((task) => task.done).length
  const lines = [
    `# ${roadmap.name}`,
    `roadmap:${roadmap.id} updated:${roadmap.updated_at} progress:${done}/${tasks.length}`,
  ]
  for (const phase of phases) {
    const phaseTasks = phase.tasks || []
    const phaseDone = phaseTasks.filter((task) => task.done).length
    lines.push(`## ${phase.num} ${phase.name} [${phaseDone}/${phaseTasks.length}]`)
    for (const task of phaseTasks) {
      lines.push(`- [${task.done ? 'x' : ' '}] ${task.id} | ${task.title}${taskFlags(task)}`)
      if (task.desc) lines.push(`  ${task.desc.replace(/\s+/g, ' ').trim()}`)
    }
  }
  return lines.join('\n')
}

export function roadmapSummary(roadmap) {
  const phases = roadmap.phases || []
  const tasks = phases.flatMap((phase) => phase.tasks || [])
  const done = tasks.filter((task) => task.done).length
  return {
    roadmapId: roadmap.id,
    name: roadmap.name,
    updatedAt: roadmap.updated_at,
    phaseCount: phases.length,
    taskCount: tasks.length,
    completedTaskCount: done,
    completionPercent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    nextTasks: tasks
      .filter((task) => task.next && !task.done)
      .map((task) => ({ id: task.id, title: task.title })),
  }
}

export function compactWriteResult(roadmap, taskId) {
  const match = taskId ? findTask(roadmap, taskId) : null
  return {
    roadmapId: roadmap.id,
    updatedAt: roadmap.updated_at,
    ...(match
      ? {
          phase: { id: match.phase.id, name: match.phase.name, progress: match.phase.progress },
          task: {
            id: match.task.id,
            title: match.task.title,
            done: match.task.done,
            next: Boolean(match.task.next),
            tags: match.task.tags || [],
            assignees: match.task.assignees || [],
            claimedBy: match.task.claimedBy || null,
          },
        }
      : {}),
  }
}
