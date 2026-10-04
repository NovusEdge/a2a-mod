import type { HttpInit, HttpResponse, ProcessRunResult, StateRead } from 'claude-code'
import type { Engine, TestBody } from 'claude-code/testing'
import type { Fetcher } from '../hooks/client.ts'
import type { Host } from '../hooks/registry.ts'
import type { CallInfo, RecentTask, TrackedTask } from '../types/index.d.ts'
import { fixtures as f } from './fixtures.ts'

// The test runtime has timers; the mod lib in tsconfig does not declare them.
declare const setTimeout: (fn: () => void, ms: number) => unknown

export type On = Parameters<TestBody>[1]

type Route = 'card' | 'send' | 'get' | 'cancel'
type Answer = unknown | ((body: any) => unknown)
const DEFAULTS: Record<Route, unknown> = { card: f.card_v1, send: f.v1_send_echo, get: f.v1_get_completed, cancel: f.v1_cancel }

/** The plugin's userConfig with the tokens setting holding the fake worker's token. */
export const WITH_TOKEN = { options: { tokens: 'fake=s3cret' } }

export const STORE = {
  workers: {
    fake: {
      alias: 'fake', name: 'Fake Worker', description: 'test double', cardUrl: 'http://worker.test/.well-known/agent-card.json',
      endpoint: 'http://worker.test/a2a/jsonrpc', version: '1.0', skills: [{ id: 'echo', name: 'Echo', description: 'Replies' }],
      needsAuth: true, auth: { kind: 'setting' }, addedAt: 0,
    },
  },
}

// One http.fetch hook per test: the kit refuses a second registration on the same event.
export function fakeNet(on: On, routes: Partial<Record<Route, Answer>> = {}) {
  const calls: { url: string; init?: HttpInit }[] = []
  const state = { down: false, status: 200 }
  const reply = (value: HttpResponse) => ({ value })
  on('http.fetch', async (_$, e) => {
    calls.push({ url: e.url, init: e.init })
    if (state.down) return reply({ status: 503, ok: false, headers: {}, text: 'down' })
    if (state.status !== 200) return reply({ status: state.status, ok: false, headers: {}, text: '' })
    const body = e.init?.body ? JSON.parse(e.init.body) : undefined
    const route: Route = e.url.endsWith('agent-card.json') ? 'card'
      : /send/i.test(body?.method) ? 'send' : /cancel/i.test(body?.method) ? 'cancel' : 'get'
    const answer = routes[route] ?? DEFAULTS[route]
    const json = typeof answer === 'function' ? (answer as (b: any) => unknown)(body) : answer
    return reply({ status: 200, ok: true, headers: { 'content-type': 'application/json' }, text: JSON.stringify(json) })
  })
  return { calls, state }
}

export const ran = (stdout: string, exitCode = 0): { value: ProcessRunResult } =>
  ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

export const runA2a = ($: Engine, args = '') =>
  $.command.run({ command: 'a2a', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

/**
 * Answers $.state from memory so a test can read what the mod wrote. A mounted drawing does not
 * redraw on these writes, so UI tests leave $.state to the engine instead.
 */
export function memState(on: On) {
  const held = new Map<string, StateRead<unknown>>()
  on('state.get', async (_$, e) => ({ value: held.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', async (_$, e) => {
    const was = held.get(e.key) ?? { value: undefined, version: 0 }
    if (e.ifVersion !== undefined && e.ifVersion !== was.version) return { value: { isSet: false, version: was.version } }
    held.set(e.key, { value: e.value, version: was.version + 1 })
    return { value: { isSet: true, version: was.version + 1 } }
  })
  return {
    recent: () => (held.get('recent')?.value ?? []) as RecentTask[],
    calls: () => (held.get('calls')?.value ?? {}) as Record<string, CallInfo>,
    tasks: () => (held.get('tasks')?.value ?? []) as TrackedTask[],
  }
}

function versioned<T>(initial: T) {
  let held: StateRead<T> = { value: initial, version: 1 }
  return {
    read: async () => held,
    write: async (value: T, ifVersion: number) => {
      if (ifVersion !== held.version) return false
      held = { value, version: held.version + 1 }
      return true
    },
    get: () => held.value as T,
  }
}

/** A Host with everything in memory, for the tracker and recent code below register.ts. */
export function fakeHost(fetch: Fetcher, left: TrackedTask[] = [], opts: { now?: number; recent?: RecentTask[] } = {}) {
  const tasks = versioned<TrackedTask[]>(left)
  const recent = versioned<RecentTask[]>(opts.recent ?? [])
  const calls = versioned<Record<string, CallInfo>>({})
  let durations: Record<string, number[]> = {}
  const wakes: string[] = []
  const statuses: (string | undefined)[] = []
  const clock = { now: opts.now ?? 0 }
  const timer: { fn?: () => void } = {}
  const host: Host = {
    fetch,
    readWorkers: async () => STORE.workers,
    writeWorkers: async () => {},
    settingTokens: { map: { fake: 's3cret' }, invalid: false },
    run: async () => { throw new Error('no commands in this test') },
    readFile: async () => { throw new Error('no files in this test') },
    readTasks: tasks.read,
    writeTasks: tasks.write,
    readRecent: recent.read,
    writeRecent: recent.write,
    readCalls: calls.read,
    writeCalls: calls.write,
    readDurations: async () => durations,
    writeDurations: async all => { durations = all },
    status: text => { statuses.push(text) },
    now: async () => clock.now,
    every: (_ms, fn) => { timer.fn = fn; return { cancel: () => { timer.fn = undefined } } },
    sleep: () => new Promise(r => setTimeout(r, 0)),
    wake: async text => { wakes.push(text) },
  }
  return {
    host, wakes, timer, statuses, clock,
    tasks: () => tasks.get(),
    recent: () => recent.get(),
    calls: () => calls.get(),
    durations: () => durations,
  }
}
