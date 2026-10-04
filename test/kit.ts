import type { ConfigRow, HttpInit, PaneOpenArgs, HttpResponse, ProcessRunResult, RenderElement, RenderPropsOf, StateRead } from 'claude-code'
import { expect, type Engine, type Plugin, type TestBody } from 'claude-code/testing'
import type { Fetcher } from '../hooks/client.ts'
import type { Host } from '../hooks/registry.ts'
import type { CallInfo, RecentTask, TrackedTask } from '../types/index.d.ts'
import { fixtures as f } from './fixtures.ts'
import { STATUS_MS } from '../hooks/ui/status.ts'

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

/**
 * Answers reads of the `recent` list with `rows`, so a pane test can show dozens of rows without
 * sending dozens of tasks. Writes still reach the engine; reads of other keys pass through.
 */
export function seedRecent(on: On, rows: readonly RecentTask[]) {
  on('state.get', async (_$, e, next) => (e.key === 'recent' ? { value: { value: [...rows], version: 1 } } : next(e)))
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
  const statusTimer: { fn?: () => unknown } = {}
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
    anim: true,
    now: async () => clock.now,
    every: (ms, fn) => {
      const slot = ms === STATUS_MS ? statusTimer : timer
      slot.fn = fn
      return { cancel: () => { slot.fn = undefined } }
    },
    sleep: () => new Promise(r => setTimeout(r, 0)),
    wake: async text => { wakes.push(text) },
  }
  return {
    host, wakes, timer, statusTimer, statuses, clock,
    tasks: () => tasks.get(),
    recent: () => recent.get(),
    calls: () => calls.get(),
    durations: () => durations,
  }
}

export const TOKEN = 's3cret'

/** The fake worker's completed GetTask answer, with `text` as its result. */
export function completedWith(text: string) {
  const r = f.v1_get_completed.result
  const artifact = r.artifacts[0]!
  return { ...f.v1_get_completed, result: { ...r, artifacts: [{ ...artifact, parts: [{ ...artifact.parts[0]!, text }] }] } }
}

export const SURFACES = ['terminal', 'desktop'] as const

export const PANE_PROPS = (bodyColumns = 60, bodyRows = 40): RenderPropsOf['Pane'] =>
  ({ title: 'A2A workers', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} })

/** The text under a node, as drawn left to right. */
export const textUnder = (n: unknown): string =>
  typeof n === 'string' ? n : ((n as Node | undefined)?.children ?? []).map(textUnder).join('')

/** The innermost Box whose text holds `needle`: one drawn line, or a block when the text spans lines. */
export function boxWith(n: unknown, needle: string): Node | undefined {
  if (!n || typeof n !== 'object') return undefined
  const node = n as Node
  for (const c of node.children ?? []) {
    const hit = boxWith(c, needle)
    if (hit) return hit
  }
  return node.type === 'Box' && textUnder(node).includes(needle) ? node : undefined
}

/**
 * Answers, beneath every plugin, what the engine answers in a session's UI: its own drawing
 * (a Text naming the component), the theme, toasts, the clipboard and pane placement. Not
 * focus: the 2.1.288 kit rejects $.ui.focus before any test hook sees it.
 * Register it before any other hook on those events.
 */
export function engineUi(on: On, opts: { copied?: boolean; theme?: string | Error } = {}) {
  const seen = { toasts: [] as string[], callIds: [] as string[], copies: [] as string[], opened: [] as string[], args: [] as PaneOpenArgs[], closed: [] as string[] }
  on('ui.render', async (_$, e) => ({ type: 'Text', props: {}, children: [`engine ${e.component}`] }) as RenderElement)
  on('config.list', async () => {
    if (opts.theme instanceof Error) throw opts.theme
    return { value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: opts.theme ?? 'dark', options: ['dark', 'light'], provider: { kind: 'engine' } }] as unknown as ConfigRow[] }
  })
  on('ui.toast', async (_$, e) => {
    if (e.text.startsWith('call-id ')) seen.callIds.push(e.text.slice('call-id '.length))
    else seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', async (_$, e) => {
    seen.copies.push(e.text)
    return { value: opts.copied === false ? { isCopied: false, reason: 'no-clipboard' } : { isCopied: true } }
  })
  on('ui.open', async (_$, e) => { seen.opened.push(e.id); seen.args.push(e); return { value: { isPlaced: true } } })
  on('ui.close', async (_$, e) => { seen.closed.push(e.id); return { value: undefined } })
  return seen
}

/** Every prompt submitted, with the context lines the hooks above attached. */
export function promptLog(on: On) {
  const seen: { text: string; context: readonly string[]; origin: string }[] = []
  on('prompt.submit', async (_$, e) => {
    seen.push({ text: e.text, context: e.context ?? [], origin: e.origin.kind })
    return { text: e.text }
  })
  return seen
}

export type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

export function clientKeys(tree: unknown): string[] {
  const n = tree as Node
  if (!n || typeof n !== 'object') return []
  const own = n.type === 'Client' && typeof n.props?.key === 'string' ? [n.props.key] : []
  return [...own, ...(n.children ?? []).flatMap(clientKeys)]
}

/** Cells across a tree as the terminal lays it out: a Button is `[ label ]`, a Client its `width`. */
export function widthOf(tree: unknown): number {
  if (typeof tree === 'string') return Math.max(...tree.split('\n').map(l => [...l].length))
  const n = tree as Node
  if (!n || typeof n !== 'object') return 0
  const kids = n.children ?? []
  switch (n.type) {
    case 'Text': return kids.reduce<number>((a, c) => a + widthOf(c), 0)
    case 'Button': return [...String(n.props?.label ?? '')].length + 4
    case 'Client': return Number(n.props?.width ?? 0)
    case 'Box': {
      const inner = n.props?.flexDirection === 'column' ? Math.max(0, ...kids.map(widthOf)) : kids.reduce<number>((a, c) => a + widthOf(c), 0)
      return inner + (n.props?.borderStyle ? 2 : 0) + 2 * Number(n.props?.paddingX ?? 0) + Number(n.props?.marginLeft ?? 0)
    }
    default: return 0
  }
}

type Drawn = { drawn: (scope?: { in: string }) => Promise<RenderElement> }

/** The tree and what each of its Clients drew. */
export async function drawnAll(ui: Drawn): Promise<RenderElement[]> {
  const tree = await ui.drawn()
  return [tree, ...(await Promise.all(clientKeys(tree).map(key => ui.drawn({ in: key }))))]
}

export async function expectNoToken(ui: Drawn): Promise<void> {
  for (const tree of await drawnAll(ui)) expect(JSON.stringify(tree)).not.toContain(TOKEN)
}

export const BAND_PROPS = (over: Partial<RenderPropsOf['AbovePrompt']> = {}): RenderPropsOf['AbovePrompt'] =>
  ({ hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {}, ...over })

/**
 * Loaded outside a2a-mod (prepend tier), so it sees every tool call first and reports its
 * tool_use_id as a toast that engineUi collects: the test $ never shows the id.
 */
export const CALL_IDS: Plugin = {
  name: 'call-ids',
  tier: 'prepend',
  register(on) {
    on('tool.call', async ($, e, next) => {
      $.ui.toast(`call-id ${e.tool_use_id}`)
      return next(e)
    })
  },
}

export const has =(tree: unknown, type: string): boolean => {
  const n = tree as Node
  return !!n && typeof n === 'object' && (n.type === type || (n.children ?? []).some(c => has(c, type)))
}
