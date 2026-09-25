import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

// Repository style: no em-dashes (U+2014) in tracked text. Use " - ", commas, or
// parentheses instead. The character is built from its code point so this file passes too.
const EM_DASH = String.fromCharCode(0x2014)
const MAX_REPORTED = 50

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const violations = []
let scannedFiles = 0

for (const file of trackedFiles) {
  let content
  try {
    content = readFileSync(file)
  } catch (error) {
    // Deleted in the working tree but still tracked; git will report it elsewhere.
    if (error?.code === 'ENOENT') continue
    throw error
  }
  if (content.includes(0)) continue // binary
  scannedFiles += 1
  const text = content.toString('utf8')
  if (!text.includes(EM_DASH)) continue
  text.split('\n').forEach((line, index) => {
    if (line.includes(EM_DASH)) violations.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`)
  })
}

if (violations.length > 0) {
  console.error(`Em-dash (U+2014) found in ${violations.length} line(s). Use " - ", a comma, or parentheses instead:`)
  for (const violation of violations.slice(0, MAX_REPORTED)) console.error(`  ${violation}`)
  if (violations.length > MAX_REPORTED) console.error(`  ...and ${violations.length - MAX_REPORTED} more`)
  process.exit(1)
}

console.log(`Em-dash check passed for ${scannedFiles} tracked text files.`)
