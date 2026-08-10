#!/usr/bin/env node
import { SERVER_VERSION, runStdioServer } from '../src/server.mjs'

const [argument] = process.argv.slice(2)
if (argument === '--version' || argument === '-v') {
  process.stdout.write(`${SERVER_VERSION}\n`)
} else if (argument === '--help' || argument === '-h') {
  process.stdout.write(
    'RoadForge MCP stdio server\n\n'
    + 'Configure either ROADFORGE_SESSION_TOKEN + ROADFORGE_ROADMAP_ID, '
    + 'or ROADFORGE_INVITE_TOKEN.\n',
  )
} else if (argument) {
  process.stderr.write(`Unknown argument: ${argument}\n`)
  process.exitCode = 2
} else {
  runStdioServer()
}
