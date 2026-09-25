import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { doctor, runCli, setupConfig } from '../src/cli.mjs'
import {
  DEFAULT_API_URL,
  configPath,
  runtimeConfig,
  saveStoredConfig,
} from '../src/config.mjs'

async function tempDir(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'roadforge-mcp-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

function writer() {
  let value = ''
  return {
    stream: { write(chunk) { value += chunk } },
    text() { return value },
  }
}

test('setup stores credentials outside repositories with user-only POSIX permissions', async (t) => {
  const directory = await tempDir(t)
  const target = path.join(directory, 'config', 'mcp.json')
  const answers = ['http://localhost:7878', 'rm_local']

  const saved = await setupConfig({
    env: {},
    pathOverride: target,
    cwd: directory,
    platform: process.platform,
    ask: async () => answers.shift(),
    askSecret: async () => 'session-secret',
  })

  assert.equal(saved, target)
  const parsed = JSON.parse(await fs.readFile(target, 'utf8'))
  assert.deepEqual(parsed, {
    apiUrl: DEFAULT_API_URL,
    roadmapId: 'rm_local',
    sessionToken: 'session-secret',
  })
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.dirname(target))).mode & 0o777, 0o700)
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600)
  }
})

test('credential configuration refuses paths inside a Git repository', async (t) => {
  const directory = await tempDir(t)
  await fs.mkdir(path.join(directory, '.git'))
  const target = path.join(directory, '.roadforge', 'mcp.json')

  await assert.rejects(
    saveStoredConfig(
      {
        apiUrl: DEFAULT_API_URL,
        roadmapId: 'rm_local',
        sessionToken: 'secret',
      },
      { pathOverride: target, cwd: directory },
    ),
    /Refusing to write RoadForge credentials inside a Git repository/,
  )
})

test('environment variables remain compatible and override stored configuration', async (t) => {
  const directory = await tempDir(t)
  const target = path.join(directory, 'mcp.json')
  await saveStoredConfig(
    {
      apiUrl: 'https://stored.example',
      roadmapId: 'rm_stored',
      sessionToken: 'stored-token',
    },
    { pathOverride: target, cwd: directory },
  )

  const runtime = await runtimeConfig({
    pathOverride: target,
    env: {
      ROADFORGE_API_URL: 'https://env.example',
      ROADFORGE_ROADMAP_ID: 'rm_env',
      ROADFORGE_SESSION_TOKEN: 'env-token',
    },
  })
  assert.equal(runtime.apiUrl, 'https://env.example')
  assert.equal(runtime.roadmapId, 'rm_env')
  assert.equal(runtime.sessionToken, 'env-token')
  assert.match(configPath({}, 'linux'), /roadforge[\\/]mcp\.json$/)
})

test('doctor uses only the lightweight revision endpoint and never prints credentials', async () => {
  const requests = []
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options })
    return new Response(JSON.stringify({
      roadmap_id: 'rm_test',
      updated_at: '2026-09-01T12:00:00Z',
    }), { status: 200 })
  }
  const env = {
    ROADFORGE_API_URL: 'https://roadforge.test',
    ROADFORGE_ROADMAP_ID: 'rm_test',
    ROADFORGE_SESSION_TOKEN: 'doctor-secret',
  }

  const result = await doctor({ env, fetchImpl })
  assert.deepEqual(result, {
    ok: true,
    roadmapId: 'rm_test',
    updatedAt: '2026-09-01T12:00:00Z',
  })
  assert.equal(new URL(requests[0].url).pathname, '/api/roadmaps/rm_test/revision')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer doctor-secret')

  const stdout = writer()
  const stderr = writer()
  const exitCode = await runCli({
    argv: ['doctor'],
    env,
    fetchImpl,
    stdout: stdout.stream,
    stderr: stderr.stream,
  })
  assert.equal(exitCode, 0)
  assert.match(stdout.text(), /RoadForge MCP OK: rm_test/)
  assert.doesNotMatch(stdout.text(), /doctor-secret/)
  assert.doesNotMatch(stderr.text(), /doctor-secret/)
  assert.equal(
    new URL(requests.at(-1).url).pathname,
    '/api/roadmaps/rm_test/revision',
  )
})
