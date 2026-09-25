import readline from 'node:readline/promises'
import { stdin as processStdin, stdout as processStdout, stderr as processStderr } from 'node:process'

import { DEFAULT_API_URL, loadStoredConfig, saveStoredConfig } from './config.mjs'
import { createRoadForgeClient } from './roadforge-client.mjs'
import { SERVER_VERSION, runStdioServer } from './server.mjs'

function valueOrDefault(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || fallback
}

async function defaultAsk(prompt, { input = processStdin, output = processStdout } = {}) {
  const rl = readline.createInterface({ input, output })
  try {
    return await rl.question(prompt)
  } finally {
    rl.close()
  }
}

async function defaultAskSecret(prompt, { input = processStdin, output = processStdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Interactive token entry requires a TTY. For non-interactive hosts, set ROADFORGE_SESSION_TOKEN in the host environment instead.')
  }
  output.write(prompt)
  input.setRawMode(true)
  input.resume()
  input.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      input.off('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('Setup cancelled.'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
          continue
        }
        if (character >= ' ') value += character
      }
    }
    input.on('data', onData)
  })
}

export async function setupConfig({
  env = process.env,
  pathOverride,
  cwd = process.cwd(),
  platform = process.platform,
  ask,
  askSecret,
} = {}) {
  const stored = await loadStoredConfig({ env, pathOverride })
  const askValue = ask || ((prompt) => defaultAsk(prompt))
  const askToken = askSecret || ((prompt) => defaultAskSecret(prompt))
  const current = stored.config
  const apiUrl = valueOrDefault(
    await askValue(`API URL [${current.apiUrl || DEFAULT_API_URL}]: `),
    current.apiUrl || DEFAULT_API_URL,
  )
  const roadmapId = valueOrDefault(
    await askValue(`Roadmap ID${current.roadmapId ? ` [${current.roadmapId}]` : ''}: `),
    current.roadmapId || '',
  )
  if (!roadmapId) throw new Error('Roadmap ID is required.')
  const enteredToken = await askToken(
    current.sessionToken
      ? 'Session token [press Enter to keep existing]: '
      : 'Session token: ',
  )
  const sessionToken = valueOrDefault(enteredToken, current.sessionToken || '')
  if (!sessionToken) throw new Error('Session token is required.')
  return saveStoredConfig(
    { apiUrl, roadmapId, sessionToken },
    { env, pathOverride, cwd, platform },
  )
}

export async function doctor({
  env = process.env,
  fetchImpl = globalThis.fetch,
  configPath,
} = {}) {
  const client = createRoadForgeClient({ env, fetchImpl, configPath })
  const revision = await client.getRevision()
  return {
    ok: true,
    roadmapId: revision.roadmapId,
    updatedAt: revision.updatedAt,
  }
}

function helpText() {
  return `RoadForge MCP\n\nUsage:\n  roadforge-mcp              Start the stdio MCP server\n  roadforge-mcp setup        Store local API/roadmap/session configuration outside the repository\n  roadforge-mcp doctor       Verify focused API connectivity and authorization\n  roadforge-mcp --version    Print version\n\nEnvironment overrides:\n  ROADFORGE_API_URL          API origin (default ${DEFAULT_API_URL})\n  ROADFORGE_ROADMAP_ID       Roadmap ID\n  ROADFORGE_SESSION_TOKEN    Session token\n\nInvite variables remain supported for process-local compatibility. Secrets are never accepted as command-line arguments.\n`
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = processStdout,
  stderr = processStderr,
  fetchImpl = globalThis.fetch,
  setupOptions = {},
  runServer = runStdioServer,
} = {}) {
  const [command, ...extra] = argv
  if (extra.length) {
    stderr.write(`Unexpected arguments: ${extra.join(' ')}\n`)
    return 2
  }
  if (command === '--version' || command === '-v') {
    stdout.write(`${SERVER_VERSION}\n`)
    return 0
  }
  if (command === '--help' || command === '-h' || command === 'help') {
    stdout.write(helpText())
    return 0
  }
  if (command === 'setup') {
    try {
      const target = await setupConfig({ env, ...setupOptions })
      stdout.write(`RoadForge MCP configuration saved to ${target}\n`)
      stdout.write('Run "roadforge-mcp doctor" to verify it.\n')
      return 0
    } catch (error) {
      stderr.write(`RoadForge MCP setup failed: ${error.message}\n`)
      return 1
    }
  }
  if (command === 'doctor') {
    try {
      const result = await doctor({ env, fetchImpl, configPath: setupOptions.pathOverride })
      stdout.write(`RoadForge MCP OK: ${result.roadmapId} @ ${result.updatedAt}\n`)
      return 0
    } catch (error) {
      stderr.write(`RoadForge MCP doctor failed: ${error.message}\n`)
      return 1
    }
  }
  if (command) {
    stderr.write(`Unknown argument: ${command}\n`)
    return 2
  }
  runServer({ env, fetchImpl, configPath: setupOptions.pathOverride })
  return 0
}
