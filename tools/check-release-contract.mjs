import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

const failures = []
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}

const rootPackage = json('package.json')
const webPackage = json('apps/web/package.json')
const mcpPackage = json('packages/roadforge-mcp/package.json')
const apiConfig = read('apps/api/src/api/config.py')
const changelog = read('CHANGELOG.md')
const makefile = read('Makefile')
const nvmrc = read('.nvmrc').trim()

const productVersion = rootPackage.version
expect(typeof productVersion === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(productVersion),
  `root package version is not SemVer-like: ${JSON.stringify(productVersion)}`)
expect(webPackage.version === productVersion,
  `web package version ${webPackage.version} does not match product version ${productVersion}`)
expect(mcpPackage.version === productVersion,
  `MCP package version ${mcpPackage.version} does not match the 0.1.x product baseline ${productVersion}`)

const apiVersionMatch = apiConfig.match(/app_version:\s*str\s*=\s*"([^"]+)"/)
expect(Boolean(apiVersionMatch), 'could not find Settings.app_version default in apps/api/src/api/config.py')
if (apiVersionMatch) {
  expect(apiVersionMatch[1] === productVersion,
    `API version ${apiVersionMatch[1]} does not match product version ${productVersion}`)
}

expect(changelog.includes(`## ${productVersion} -`),
  `CHANGELOG.md has no dated release heading for ${productVersion}`)

const packageManagerMatch = String(rootPackage.packageManager ?? '').match(/^pnpm@(\d+\.\d+\.\d+)$/)
expect(Boolean(packageManagerMatch),
  `root packageManager must pin an exact pnpm version, received ${JSON.stringify(rootPackage.packageManager)}`)

const makePnpmMatch = makefile.match(/^PNPM_VERSION\s*\?=\s*([^\s#]+)$/m)
expect(Boolean(makePnpmMatch), 'Makefile must declare PNPM_VERSION')
if (packageManagerMatch && makePnpmMatch) {
  expect(makePnpmMatch[1] === packageManagerMatch[1],
    `Makefile pnpm ${makePnpmMatch[1]} does not match packageManager pnpm ${packageManagerMatch[1]}`)
}

expect(/^\d+$/.test(nvmrc), `.nvmrc must contain one Node major version, received ${JSON.stringify(nvmrc)}`)
expect(nvmrc === '24', `RoadForge reference Node major is expected to be 24, received ${nvmrc}`)
expect(rootPackage.engines?.node === webPackage.engines?.node,
  `root/web Node engine ranges differ: ${rootPackage.engines?.node} vs ${webPackage.engines?.node}`)
expect(rootPackage.engines?.node === mcpPackage.engines?.node,
  `root/MCP Node engine ranges differ: ${rootPackage.engines?.node} vs ${mcpPackage.engines?.node}`)

if (failures.length) {
  console.error('Release contract validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Release contract validated: RoadForge ${productVersion}, Node ${nvmrc}, pnpm ${packageManagerMatch?.[1]}.`)
}
