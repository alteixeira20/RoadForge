import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { parseDocument } from 'yaml'

const root = process.cwd()
const templateDirectory = resolve(root, '.github/ISSUE_TEMPLATE')
const expectedForms = new Map([
  ['accessibility_problem.yml', {
    name: 'Accessibility problem',
    title: '[Accessibility]: ',
    label: 'accessibility',
  }],
  ['bug_report.yml', {
    name: 'Bug report',
    title: '[Bug]: ',
    label: 'bug',
  }],
  ['documentation_problem.yml', {
    name: 'Documentation problem',
    title: '[Docs]: ',
    label: 'documentation',
  }],
  ['feature_request.yml', {
    name: 'Feature request',
    title: '[Feature]: ',
    label: 'enhancement',
  }],
  ['self_hosting_deployment_problem.yml', {
    name: 'Self-hosting/deployment problem',
    title: '[Self-hosting]: ',
    label: 'self-hosting',
  }],
  ['ux_usability_problem.yml', {
    name: 'UX/usability problem',
    title: '[UX]: ',
    label: 'usability',
  }],
])
const allowedBodyTypes = new Set(['checkboxes', 'dropdown', 'input', 'markdown', 'textarea'])
const requiredPrivacyTerms = [
  'credentials',
  'tokens',
  'secrets',
  'private logs',
  'roadmap exports',
]

function fail(message) {
  throw new Error(`Issue form validation failed: ${message}`)
}

async function parseYaml(path) {
  const source = await readFile(path, 'utf8')
  const document = parseDocument(source, { prettyErrors: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    fail(`${path} is invalid YAML:\n${document.errors.map(String).join('\n')}`)
  }
  return document.toJS()
}

function validateForm(filename, form, expected) {
  if (!form || typeof form !== 'object') fail(`${filename} must contain a mapping`)
  if (form.name !== expected.name) fail(`${filename} must be named "${expected.name}"`)
  if (typeof form.description !== 'string' || form.description.trim() === '') {
    fail(`${filename} needs a description`)
  }
  if (form.title !== expected.title) fail(`${filename} must use title prefix "${expected.title}"`)
  if (
    !Array.isArray(form.labels)
    || form.labels.length !== 1
    || form.labels[0] !== expected.label
  ) {
    fail(`${filename} must apply only the "${expected.label}" label`)
  }
  if (!Array.isArray(form.body) || form.body.length === 0) fail(`${filename} needs body fields`)

  const ids = new Set()
  for (const [index, item] of form.body.entries()) {
    if (!item || typeof item !== 'object' || !allowedBodyTypes.has(item.type)) {
      fail(`${filename} body item ${index + 1} has an unsupported type`)
    }
    if (item.type === 'markdown') continue
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      fail(`${filename} body item ${index + 1} needs an id`)
    }
    if (ids.has(item.id)) fail(`${filename} repeats body id "${item.id}"`)
    ids.add(item.id)
    if (!item.attributes || typeof item.attributes.label !== 'string') {
      fail(`${filename} field "${item.id}" needs a label`)
    }
  }

  const formText = JSON.stringify(form).toLowerCase()
  for (const term of requiredPrivacyTerms) {
    if (!formText.includes(term)) fail(`${filename} must warn against publishing ${term}`)
  }
  if (!formText.includes('security vulnerability')) {
    fail(`${filename} must direct security vulnerabilities away from public issues`)
  }
}

const filenames = (await readdir(templateDirectory))
  .filter((filename) => filename.endsWith('.yml'))
  .filter((filename) => filename !== 'config.yml')
  .sort()
const expectedFilenames = [...expectedForms.keys()].sort()
if (JSON.stringify(filenames) !== JSON.stringify(expectedFilenames)) {
  fail(`expected exactly ${expectedFilenames.join(', ')}; found ${filenames.join(', ')}`)
}

for (const [filename, expected] of expectedForms) {
  const form = await parseYaml(resolve(templateDirectory, filename))
  validateForm(filename, form, expected)
}

const config = await parseYaml(resolve(templateDirectory, 'config.yml'))
if (config.blank_issues_enabled !== false) fail('blank issues must be disabled')
if (!Array.isArray(config.contact_links) || config.contact_links.length !== 1) {
  fail('the chooser must contain exactly one private security contact')
}
const securityContact = config.contact_links[0]
if (
  securityContact?.name !== 'Security vulnerability'
  || securityContact?.url !== 'https://github.com/alteixeira20/RoadForge/security/advisories/new'
  || !String(securityContact?.about).includes('privately')
) {
  fail('security reports must route to the private GitHub Security Advisory form')
}

console.log('Issue form validation passed: 6 public forms and 1 private security route.')
