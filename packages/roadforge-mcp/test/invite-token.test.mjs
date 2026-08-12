import assert from 'node:assert/strict'
import test from 'node:test'

import { createRoadForgeClient } from '../src/roadforge-client.mjs'

function response(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload)
    },
  }
}

function clientFor(inviteUrl) {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('/api/roadmaps/join')) {
      return response({
        roadmap_id: 'rm_test',
        session_token: 'session_test',
      })
    }
    return response({
      id: 'rm_test',
      name: 'Roadmap',
      updated_at: '2026-08-12T00:00:00Z',
      phases: [],
    })
  }
  return {
    client: createRoadForgeClient({
      env: {
        ROADFORGE_API_URL: 'https://roadforge.example',
        ROADFORGE_INVITE_URL: inviteUrl,
      },
      fetchImpl,
    }),
    requests,
  }
}

test('MCP prefers the canonical fragment invite token', async () => {
  const { client, requests } = clientFor(
    'https://roadforge.example/join?token=legacy-query#token=canonical-fragment',
  )

  await client.getRoadmap()

  const joinBody = JSON.parse(requests[0].options.body)
  assert.equal(joinBody.token, 'canonical-fragment')
  assert.equal(requests[0].url, 'https://roadforge.example/api/roadmaps/join')
})

test('MCP accepts legacy query invite links only as a compatibility fallback', async () => {
  const { client, requests } = clientFor(
    'https://roadforge.example/join?token=legacy-query',
  )

  await client.getRoadmap()

  const joinBody = JSON.parse(requests[0].options.body)
  assert.equal(joinBody.token, 'legacy-query')
})
