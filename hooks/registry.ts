import type { ProcessRunResult, StateRead, Timer } from 'claude-code'
import type { Target, TrackedTask, Worker } from '../types/index.d.ts'
import { A2AError, type Fetcher } from './client.ts'

/** The `tokens` plugin setting, parsed once per load. `invalid` when it was not a JSON object. */
export type SettingTokens = { map: Readonly<Record<string, string>>; invalid: boolean }

// The engine as the other modules see it. The loader refuses $ passed across an import,
// so register.ts builds this from $ in hostOf.
export type Host = {
  fetch: Fetcher
  readWorkers(): Promise<unknown>
  writeWorkers(all: Record<string, Worker>): Promise<void>
  settingTokens: SettingTokens
  /** Runs argv directly, no shell. */
  run(argv: readonly string[]): Promise<ProcessRunResult>
  readFile(path: string): Promise<string>
  readTasks(): Promise<StateRead<TrackedTask[]>>
  /** False when another write landed since `ifVersion`. */
  writeTasks(tasks: TrackedTask[], ifVersion: number): Promise<boolean>
  status(text: string | undefined): void
  every(ms: number, fn: () => void): Timer
  sleep(ms: number): Promise<void>
  wake(text: string): Promise<void>
}

export function parseTokens(raw: unknown): SettingTokens {
  if (raw === undefined || raw === '') return { map: {}, invalid: false }
  try {
    const value: unknown = JSON.parse(String(raw))
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { map: Object.fromEntries(Object.entries(value).filter((kv): kv is [string, string] => typeof kv[1] === 'string' && kv[1] !== '')), invalid: false }
    }
  } catch {
    // The parse error can quote the setting, which holds tokens; it is never shown.
  }
  return { map: {}, invalid: true }
}

/** Splits on whitespace; a double-quoted run is one word, with `\"` inside it a quote. */
export function splitArgs(s: string): string[] {
  const words: string[] = []
  let cur = ''
  let quoted = false
  let started = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quoted && c === '\\' && s[i + 1] === '"') { cur += '"'; i++ }
    else if (c === '"') { quoted = !quoted; started = true }
    else if (!quoted && /\s/.test(c)) { if (started) words.push(cur); cur = ''; started = false }
    else { cur += c; started = true }
  }
  if (quoted) throw new A2AError('a double quote is not closed')
  if (started) words.push(cur)
  return words
}

export async function loadWorkers(host: Host): Promise<Record<string, Worker>> {
  return ((await host.readWorkers()) as Record<string, Worker> | undefined) ?? {}
}

export async function saveWorker(host: Host, w: Worker): Promise<void> {
  await host.writeWorkers({ ...(await loadWorkers(host)), [w.alias]: w })
  forgetToken(w)
}

export async function removeWorker(host: Host, alias: string): Promise<boolean> {
  const all = await loadWorkers(host)
  const w = all[alias]
  if (!w) return false
  delete all[alias]
  await host.writeWorkers(all)
  forgetToken(w)
  return true
}

export const TOKEN_TTL_MS = 5 * 60_000
const cache = new Map<string, { token: string; at: number }>()

export function forgetToken(w: Worker): void {
  cache.delete(w.alias)
}

/** A 401 or 403 means the cached token is stale: the next call fetches it again. */
export function noteFailure(w: Worker, err: unknown): void {
  if (err instanceof A2AError && (err.status === 401 || err.status === 403)) forgetToken(w)
}

async function fetchToken(host: Host, w: Worker): Promise<string | undefined> {
  const auth = w.auth
  if (auth.kind === 'setting') return host.settingTokens.map[w.alias]
  if (auth.kind === 'file') {
    let text: string
    try { text = await host.readFile(auth.path) } catch { throw new A2AError(`could not read the token file ${auth.path} for worker ${w.alias}`) }
    if (!text.trim()) throw new A2AError(`the token file ${auth.path} for worker ${w.alias} is empty`)
    return text.trim()
  }
  // The command's output is never put in a message: on failure it may be the token, or part of it.
  let out: ProcessRunResult
  try { out = await host.run(splitArgs(auth.cmd)) } catch { throw new A2AError(`the token command for worker ${w.alias} could not run (${auth.cmd})`) }
  if (out.exitCode !== 0) throw new A2AError(`the token command for worker ${w.alias} failed with exit code ${out.exitCode} (${auth.cmd})`)
  if (!out.stdout.trim()) throw new A2AError(`the token command for worker ${w.alias} printed nothing (${auth.cmd})`)
  return out.stdout.trim()
}

export async function targetOf(host: Host, w: Worker): Promise<Target> {
  let token: string | undefined
  if (w.auth.kind === 'setting') {
    token = await fetchToken(host, w)
  } else {
    const held = cache.get(w.alias)
    if (held && Date.now() - held.at < TOKEN_TTL_MS) token = held.token
    else {
      token = await fetchToken(host, w)
      if (token) cache.set(w.alias, { token, at: Date.now() })
    }
  }
  return token ? { ...w, token } : w
}
