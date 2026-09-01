import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_API_URL = 'http://localhost:7878'

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function configPath(env = process.env, platform = process.platform) {
  if (nonEmpty(env.ROADFORGE_MCP_CONFIG)) return path.resolve(env.ROADFORGE_MCP_CONFIG.trim())
  if (platform === 'win32') {
    const base = nonEmpty(env.APPDATA) || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(base, 'RoadForge', 'mcp.json')
  }
  const base = nonEmpty(env.XDG_CONFIG_HOME) || path.join(os.homedir(), '.config')
  return path.join(base, 'roadforge', 'mcp.json')
}

async function insideRepository(targetPath, cwd = process.cwd()) {
  const target = path.resolve(targetPath)
  let current = path.resolve(cwd)
  for (;;) {
    try {
      const stat = await fs.stat(path.join(current, '.git'))
      if (stat.isDirectory() || stat.isFile()) {
        const relative = path.relative(current, target)
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) return false
    current = parent
  }
}

export async function loadStoredConfig({ env = process.env, pathOverride } = {}) {
  const target = pathOverride || configPath(env)
  let raw
  try {
    raw = await fs.readFile(target, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { path: target, config: {} }
    throw new Error(`Could not read RoadForge MCP config at ${target}: ${error.message}`)
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`RoadForge MCP config at ${target} is not valid JSON. Run "roadforge-mcp setup" again.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`RoadForge MCP config at ${target} must contain a JSON object.`)
  }
  return {
    path: target,
    config: {
      apiUrl: nonEmpty(parsed.apiUrl),
      roadmapId: nonEmpty(parsed.roadmapId),
      sessionToken: nonEmpty(parsed.sessionToken),
    },
  }
}

export async function saveStoredConfig(
  config,
  { env = process.env, pathOverride, cwd = process.cwd(), platform = process.platform } = {},
) {
  const target = pathOverride || configPath(env, platform)
  if (await insideRepository(target, cwd)) {
    throw new Error('Refusing to write RoadForge credentials inside a Git repository. Use the default user config location or ROADFORGE_MCP_CONFIG outside the repository.')
  }
  const apiUrl = nonEmpty(config.apiUrl) || DEFAULT_API_URL
  const roadmapId = nonEmpty(config.roadmapId)
  const sessionToken = nonEmpty(config.sessionToken)
  if (!roadmapId) throw new Error('Roadmap ID is required.')
  if (!sessionToken) throw new Error('Session token is required.')

  const directory = path.dirname(target)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const payload = `${JSON.stringify({ apiUrl, roadmapId, sessionToken }, null, 2)}\n`
  await fs.writeFile(target, payload, { encoding: 'utf8', mode: 0o600 })
  if (platform !== 'win32') {
    await fs.chmod(directory, 0o700)
    await fs.chmod(target, 0o600)
  }
  return target
}

export async function runtimeConfig({ env = process.env, pathOverride } = {}) {
  const stored = await loadStoredConfig({ env, pathOverride })
  return {
    configPath: stored.path,
    apiUrl: nonEmpty(env.ROADFORGE_API_URL) || stored.config.apiUrl || DEFAULT_API_URL,
    roadmapId: nonEmpty(env.ROADFORGE_ROADMAP_ID) || stored.config.roadmapId,
    sessionToken: nonEmpty(env.ROADFORGE_SESSION_TOKEN) || stored.config.sessionToken,
  }
}
