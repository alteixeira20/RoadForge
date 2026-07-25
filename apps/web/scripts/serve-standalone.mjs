// Serves the same standalone artifact the Dockerfile ships, so benchmark and
// smoke measurements reflect the deployed server instead of `next start`
// (which Next rejects for `output: 'standalone'`).
import { cp, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const standaloneRoot = path.join(webRoot, '.next', 'standalone')
const appRoot = path.join(standaloneRoot, 'apps', 'web')
const serverEntry = path.join(appRoot, 'server.js')

async function assertBuilt() {
  try {
    await access(serverEntry)
  } catch {
    throw new Error(`Standalone build missing at ${serverEntry}. Run \`pnpm build\` first.`)
  }
}

// `next build` leaves static assets and public files outside the standalone
// tree; the Dockerfile copies them in at image build time.
async function stageStaticAssets() {
  await cp(path.join(webRoot, '.next', 'static'), path.join(appRoot, '.next', 'static'), {
    recursive: true,
  })
  await cp(path.join(webRoot, 'public'), path.join(appRoot, 'public'), { recursive: true })
}

function startServer() {
  const child = spawn(process.execPath, [path.join('apps', 'web', 'server.js')], {
    cwd: standaloneRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: process.env.PORT ?? '4174',
      HOSTNAME: process.env.HOSTNAME ?? '127.0.0.1',
    },
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal))
  }
  child.on('exit', (code) => process.exit(code ?? 0))
}

await assertBuilt()
await stageStaticAssets()
startServer()
