import { DEFAULT_API_URL, runtimeConfig } from './config.mjs'

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

function inviteToken(env) {
  const raw = optionalEnv(env, 'ROADFORGE_INVITE_TOKEN')
    || optionalEnv(env, 'ROADFORGE_INVITE_URL')
  if (!raw) return null
  if (!raw.includes('://')) return raw
  try {
    const inviteUrl = new URL(raw)
    const fragment = inviteUrl.hash.startsWith('#') ? inviteUrl.hash.slice(1) : inviteUrl.hash
    const fragmentToken = new URLSearchParams(fragment).get('token')?.trim()
    if (fragmentToken) return fragmentToken
    return inviteUrl.searchParams.get('token')?.trim() || null
  } catch {
    throw new RoadForgeApiError('ROADFORGE_INVITE_URL is not a valid URL')
  }
}

function apiMessage(status, payload) {
  if (typeof payload?.detail === 'string') return payload.detail
  if (typeof payload?.message === 'string') return payload.message
  return `RoadForge API request failed with status ${status}`
}

function addQuery(path, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item))
    } else {
      query.set(key, String(value))
    }
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export function normalizeSummary(payload) {
  return {
    roadmapId: payload.roadmap_id,
    name: payload.name,
    updatedAt: payload.updated_at,
    phaseCount: payload.phase_count,
    taskCount: payload.total_task_count,
    completedTaskCount: payload.completed_task_count,
    openTaskCount: payload.open_task_count,
    completionPercent: payload.completion_percent,
    phases: (payload.phases || []).map((phase) => ({
      id: phase.id,
      num: phase.num,
      name: phase.name,
      status: phase.status,
      progress: phase.progress,
      taskCount: phase.task_count,
      completedTaskCount: phase.completed_task_count,
      openTaskCount: phase.open_task_count,
    })),
    nextTaskCount: payload.next_task_count,
    nextTasks: (payload.next_tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      phaseId: task.phase_id,
      phaseName: task.phase_name,
    })),
    nextTasksTruncated: payload.next_tasks_truncated,
  }
}

function normalizePhase(phase) {
  if (!phase) return null
  return {
    id: phase.id,
    num: phase.num,
    name: phase.name,
    status: phase.status,
    progress: phase.progress,
    ...(phase.task_count === undefined ? {} : { taskCount: phase.task_count }),
    ...(phase.completed_task_count === undefined
      ? {}
      : { completedTaskCount: phase.completed_task_count }),
    ...(phase.open_task_count === undefined ? {} : { openTaskCount: phase.open_task_count }),
  }
}

function normalizeSearch(payload) {
  return {
    roadmapId: payload.roadmap_id,
    updatedAt: payload.updated_at,
    query: payload.query,
    matchingTaskCount: payload.matching_task_count,
    returnedTaskCount: payload.returned_task_count,
    omittedTaskCount: payload.omitted_task_count,
    truncated: payload.truncated,
    results: (payload.results || []).map((entry) => ({
      phase: normalizePhase(entry.phase),
      task: entry.task,
    })),
  }
}

function normalizeTaskDetail(payload) {
  return {
    roadmapId: payload.roadmap_id,
    updatedAt: payload.updated_at,
    phase: normalizePhase(payload.phase),
    task: payload.task,
  }
}

function normalizeContext(payload) {
  return {
    roadmapId: payload.roadmap_id,
    name: payload.name,
    updatedAt: payload.updated_at,
    taskCount: payload.total_task_count,
    completedTaskCount: payload.completed_task_count,
    openTaskCount: payload.open_task_count,
    matchingTaskCount: payload.matching_task_count,
    returnedTaskCount: payload.returned_task_count,
    omittedTaskCount: payload.omitted_task_count,
    truncated: payload.truncated,
    results: (payload.results || []).map((entry) => ({
      phase: normalizePhase(entry.phase),
      task: {
        ...entry.task,
        descriptionPreview: entry.task.description_preview ?? null,
        description_preview: undefined,
      },
    })),
  }
}

function normalizeMutation(payload) {
  return {
    roadmapId: payload.roadmap_id,
    updatedAt: payload.updated_at,
    affectedEntityType: payload.affected_entity_type,
    affectedEntityId: payload.affected_entity_id ?? null,
    dependencyId: payload.dependency_id ?? null,
    removed: Boolean(payload.removed),
    phase: normalizePhase(payload.phase),
    task: payload.task ?? null,
    tag: payload.tag ?? null,
  }
}

export function createRoadForgeClient({
  env = process.env,
  fetchImpl = globalThis.fetch,
  configPath,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A Fetch API implementation is required')
  }

  let resolvedRuntime = null
  let resolvedAuth = null

  async function config() {
    if (!resolvedRuntime) {
      resolvedRuntime = await runtimeConfig({ env, pathOverride: configPath })
    }
    return resolvedRuntime
  }

  async function fetchJson(path, { method = 'GET', body, authorization } = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    timeout.unref?.()
    let response
    try {
      const runtime = await config()
      const baseUrl = (runtime.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '')
      response = await fetchImpl(`${baseUrl}${path}`, {
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
      if (error instanceof RoadForgeApiError) throw error
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
    const runtime = await config()
    const envSessionToken = optionalEnv(env, 'ROADFORGE_SESSION_TOKEN')
    if (envSessionToken) {
      const roadmapId = optionalEnv(env, 'ROADFORGE_ROADMAP_ID') || runtime.roadmapId
      if (!roadmapId) {
        throw new RoadForgeApiError(
          'ROADFORGE_ROADMAP_ID is required with ROADFORGE_SESSION_TOKEN.',
        )
      }
      resolvedAuth = { roadmapId, sessionToken: envSessionToken }
      return resolvedAuth
    }

    const token = inviteToken(env)
    if (token) {
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

    if (runtime.sessionToken && runtime.roadmapId) {
      resolvedAuth = {
        roadmapId: runtime.roadmapId,
        sessionToken: runtime.sessionToken,
      }
      return resolvedAuth
    }
    throw new RoadForgeApiError(
      'RoadForge MCP is not configured. Run "roadforge-mcp setup" or set '
        + 'ROADFORGE_SESSION_TOKEN and ROADFORGE_ROADMAP_ID.',
    )
  }

  async function request(path, { method = 'GET', body } = {}) {
    const credentials = await auth()
    return fetchJson(path, {
      method,
      body,
      authorization: credentials.sessionToken,
    })
  }

  async function roadmapPath(suffix = '') {
    const { roadmapId } = await auth()
    return `/api/roadmaps/${encodeURIComponent(roadmapId)}${suffix}`
  }

  async function clientPath(suffix = '') {
    return roadmapPath(`/client${suffix}`)
  }

  async function getRoadmap() {
    return request(await roadmapPath())
  }

  async function getSummary(maxNext = 20) {
    const payload = await request(
      addQuery(await roadmapPath('/summary'), { max_next: maxNext }),
    )
    return normalizeSummary(payload)
  }

  async function getRevision() {
    const payload = await request(await roadmapPath('/revision'))
    return { roadmapId: payload.roadmap_id, updatedAt: payload.updated_at }
  }

  async function searchTasks(query, { includeCompleted = false, maxResults = 20 } = {}) {
    const payload = await request(
      addQuery(await roadmapPath('/tasks/search'), {
        query,
        include_completed: includeCompleted,
        limit: maxResults,
      }),
    )
    return normalizeSearch(payload)
  }

  async function getTask(taskId) {
    const payload = await request(
      await roadmapPath(`/tasks/${encodeURIComponent(taskId)}`),
    )
    return normalizeTaskDetail(payload)
  }

  async function getContext(options = {}) {
    const payload = await request(
      addQuery(await roadmapPath('/context'), {
        phase_id: options.phaseIds,
        task_id: options.taskIds,
        open_only: options.openOnly || undefined,
        next_only: options.nextOnly || undefined,
        include_descriptions: options.includeDescriptions || undefined,
        limit: options.maxTasks ?? 200,
      }),
    )
    return normalizeContext(payload)
  }

  async function currentRevision(expectedUpdatedAt) {
    if (expectedUpdatedAt) return expectedUpdatedAt
    return (await getRevision()).updatedAt
  }

  async function updateTask(taskId, fields, expectedUpdatedAt) {
    return normalizeMutation(
      await request(await clientPath(`/tasks/${encodeURIComponent(taskId)}`), {
        method: 'PATCH',
        body: {
          ...fields,
          last_updated_at: await currentRevision(expectedUpdatedAt),
        },
      }),
    )
  }

  async function setTaskDone(taskId, done, expectedUpdatedAt) {
    return normalizeMutation(
      await request(await clientPath(`/tasks/${encodeURIComponent(taskId)}/done`), {
        method: 'PATCH',
        body: {
          done,
          last_updated_at: await currentRevision(expectedUpdatedAt),
        },
      }),
    )
  }

  async function createTask(phaseId, task) {
    return normalizeMutation(
      await request(await clientPath(`/phases/${encodeURIComponent(phaseId)}/tasks`), {
        method: 'POST',
        body: task,
      }),
    )
  }

  async function deleteTask(taskId) {
    return normalizeMutation(
      await request(await clientPath(`/tasks/${encodeURIComponent(taskId)}`), {
        method: 'DELETE',
      }),
    )
  }

  async function setDependency(taskId, dependencyId, linked) {
    const path = await clientPath(
      `/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(dependencyId)}`,
    )
    return normalizeMutation(
      await request(path, { method: linked ? 'PUT' : 'DELETE' }),
    )
  }

  async function createPhase(phase) {
    return normalizeMutation(
      await request(await clientPath('/phases'), {
        method: 'POST',
        body: phase,
      }),
    )
  }

  async function updatePhase(phaseId, fields) {
    return normalizeMutation(
      await request(await clientPath(`/phases/${encodeURIComponent(phaseId)}`), {
        method: 'PATCH',
        body: fields,
      }),
    )
  }

  async function deletePhase(phaseId) {
    return normalizeMutation(
      await request(await clientPath(`/phases/${encodeURIComponent(phaseId)}`), {
        method: 'DELETE',
      }),
    )
  }

  async function renameRoadmap(name) {
    return normalizeMutation(
      await request(await clientPath('/name'), {
        method: 'PATCH',
        body: { name },
      }),
    )
  }

  async function createTag({ id, label, color, expectedUpdatedAt }) {
    return normalizeMutation(
      await request(await clientPath('/tags'), {
        method: 'POST',
        body: {
          ...(id ? { id } : {}),
          label,
          ...(color ? { color } : {}),
          last_updated_at: await currentRevision(expectedUpdatedAt),
        },
      }),
    )
  }

  return {
    getRoadmap,
    getSummary,
    getRevision,
    searchTasks,
    getTask,
    getContext,
    updateTask,
    setTaskDone,
    createTask,
    deleteTask,
    setDependency,
    createPhase,
    updatePhase,
    deletePhase,
    renameRoadmap,
    createTag,
  }
}

export function compactContextText(context) {
  const lines = [
    `# ${context.name}`,
    `roadmap:${context.roadmapId} updated:${context.updatedAt} progress:${context.completedTaskCount}/${context.taskCount} matching:${context.matchingTaskCount} returned:${context.returnedTaskCount} omitted:${context.omittedTaskCount}`,
  ]
  let activePhase = null
  for (const entry of context.results) {
    if (entry.phase.id !== activePhase) {
      activePhase = entry.phase.id
      lines.push(
        `## ${entry.phase.num} ${entry.phase.name} [${entry.phase.progress}%] id:${entry.phase.id}`,
      )
    }
    const task = entry.task
    const flags = []
    if (task.next) flags.push('next')
    if (task.complexity) flags.push(`complexity:${task.complexity}`)
    if (task.est) flags.push(`est:${task.est}`)
    if (task.parentId) flags.push(`parent:${task.parentId}`)
    if (task.deps?.length) flags.push(`deps:${task.deps.join(',')}`)
    if (task.tags?.length) flags.push(`tags:${task.tags.join(',')}`)
    if (task.assignees?.length) flags.push(`owners:${task.assignees.join(',')}`)
    lines.push(
      `- [${task.done ? 'x' : ' '}] ${task.id} | ${task.title}`
        + `${flags.length ? ` | ${flags.join(' | ')}` : ''}`,
    )
    if (task.descriptionPreview) lines.push(`  ${task.descriptionPreview}`)
  }
  if (context.truncated) {
    lines.push(
      `… ${context.omittedTaskCount} matching task(s) omitted; `
        + 'narrow filters or increase maxTasks.',
    )
  }
  return lines.join('\n')
}
