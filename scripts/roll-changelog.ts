// Moves the Unreleased section under a version heading, or refuses the release.
// `just release` runs it with --check before it writes anything, so a release with no
// changelog entry stops there and not at a tag.
// Usage: node scripts/roll-changelog.ts <version> [--date YYYY-MM-DD] [--path FILE] [--check]
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const UNRELEASED = '## [Unreleased]'
const HEADING = /^## \[([^\]]+)\]/m
const LINK = /^\[Unreleased\]:\s*(\S*?\/compare\/)(\S+?)\.\.\.HEAD[ \t]*$/m

export function roll(text: string, version: string, today: string): string {
  if (text.includes(`## [${version}]`)) throw new Error(`${version} already has a section`)
  const start = text.indexOf(UNRELEASED)
  if (start === -1) throw new Error(`no ${UNRELEASED} heading`)
  const bodyAt = start + UNRELEASED.length
  const next = HEADING.exec(text.slice(bodyAt))
  const end = next ? bodyAt + next.index : text.length
  const body = text.slice(bodyAt, end).trim()
  if (!body) throw new Error(`${UNRELEASED} is empty; write the entry before releasing ${version}`)
  let out = `${text.slice(0, bodyAt)}\n\n## [${version}] - ${today}\n\n${body}\n\n${text.slice(end)}`
  // Optional: this file has no compare links yet. A stale one is a dead link on the released page.
  const link = LINK.exec(out)
  if (link) {
    const [whole, base, previous] = link
    out = `${out.slice(0, link.index)}[Unreleased]: ${base}v${version}...HEAD\n[${version}]: ${base}${previous}...v${version}${out.slice(link.index + whole.length)}`
  }
  return out
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { date: { type: 'string' }, path: { type: 'string', default: 'CHANGELOG.md' }, check: { type: 'boolean' } },
  })
  const [version] = positionals
  if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error('usage: roll-changelog.ts <version, without a leading v> [--date YYYY-MM-DD] [--path FILE] [--check]')
    process.exit(2)
  }
  const path = values.path!
  try {
    const rolled = roll(readFileSync(path, 'utf8'), version, values.date ?? new Date().toISOString().slice(0, 10))
    if (!values.check) {
      writeFileSync(path, rolled)
      console.log(`${path}: rolled Unreleased into ${version}`)
    }
  } catch (err) {
    console.error(`${path}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}
