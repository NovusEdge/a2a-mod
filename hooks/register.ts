import type { EngineInterface, Register } from 'claude-code'
import type { RecentState, Worker } from '../types/index.d.ts'
import { A2AError, cancelTask, getTask, send } from './client.ts'
import { runCommand, USAGE } from './command.ts'
import { describeOutcome, FULL_MAX } from './format.ts'
import { noteCall, noteSent, noteState } from './recent.ts'
import { loadWorkers, noteFailure, parseTokens, targetOf, type Host, type SettingTokens } from './registry.ts'
import { resume, showStatus, track } from './tracker.ts'
import { isLive } from './wire.ts'

type Engine = EngineInterface

const TASKS = { plugin: 'a2a-mod', key: 'tasks' } as const
const RECENT = { plugin: 'a2a-mod', key: 'recent' } as const
const CALLS = { plugin: 'a2a-mod', key: 'calls' } as const
const TOKEN_CMD_TIMEOUT_MS = 10_000

function hostOf($: Engine, settingTokens: SettingTokens): Host {
  return {
    fetch: (url, init) => $.http.fetch(url, init),
    readWorkers: () => $.store.get('workers'),
    writeWorkers: all => $.store.set('workers', all),
    settingTokens,
    run: argv => $.process.run(argv, { timeoutMs: TOKEN_CMD_TIMEOUT_MS }),
    readFile: path => $.fs.read(path),
    readTasks: () => $.state.get(TASKS),
    writeTasks: async (tasks, ifVersion) => (await $.state.set(TASKS, tasks, { ifVersion })).isSet,
    readRecent: () => $.state.get(RECENT),
    writeRecent: async (recent, ifVersion) => (await $.state.set(RECENT, recent, { ifVersion })).isSet,
    readCalls: () => $.state.get(CALLS),
    writeCalls: async (calls, ifVersion) => (await $.state.set(CALLS, calls, { ifVersion })).isSet,
    readDurations: async () => ((await $.store.get('durations')) as Record<string, number[]> | undefined) ?? {},
    writeDurations: all => $.store.set('durations', all),
    status: text => $.ui.status(text),
    // Wall time, as the backend has always stamped startedAt; $.clock.now is answered only under mock.clock in tests.
    now: async () => Date.now(),
    every: (ms, fn) => $.clock.every(ms, fn),
    sleep: ms => $.clock.sleep(ms),
    wake: async text => { await $.prompt.submit({ text }) },
  }
}

const TOOLS = [
  { name: 'workers', description: 'List the A2A worker agents the user registered, with their skills. Call before send to pick a worker.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'send',
    description: 'Send a task to an A2A worker agent. Returns the answer if it finishes within a few seconds; otherwise returns a task id, and you get a message when it finishes. Do not poll. Pass taskId to answer a worker that asked for input, contextId to continue a conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        worker: { type: 'string', description: 'Worker alias from the workers tool' },
        message: { type: 'string', description: 'What the worker should do, self-contained' },
        taskId: { type: 'string' },
        contextId: { type: 'string' },
      },
      required: ['worker', 'message'],
    },
  },
  {
    name: 'task',
    description: 'Get the state and full result of an A2A task, or cancel it.',
    inputSchema: {
      type: 'object',
      properties: { worker: { type: 'string' }, taskId: { type: 'string' }, cancel: { type: 'boolean' } },
      required: ['worker', 'taskId'],
    },
  },
]

export const INLINE_POLLS_MS = [500, 1000, 2000, 4000]
// Sleeps count against the hook's 10 s budget; this keeps the last getTask and the reply inside it.
const BUDGET_RESERVE_MS = 1500
// What a bounded call leaves of the budget for tracking the task and replying.
const REPLY_MS = 500

// Waiting on $.http.fetch does not spend the hook budget, so a silent worker would hold Claude's turn
// with no limit. Race it against what is left of the budget.
async function bounded<T>($: Engine, remainingMs: number, signal: AbortSignal, alias: string, work: Promise<T>): Promise<T> {
  const stop = new AbortController()
  const onAbort = () => stop.abort()
  signal.addEventListener('abort', onAbort)
  const ms = Math.max(0, remainingMs - REPLY_MS)
  try {
    return await Promise.race([
      work,
      // An aborted or failed timer leaves the race to the work.
      $.clock.sleep(ms, { signal: stop.signal }).then(
        (): never => { throw new A2AError(`worker ${alias} did not answer within ${Math.round(ms / 1000)} s. Try again later, or ask the user to check it.`) },
        () => new Promise<never>(() => {}),
      ),
    ])
  } finally {
    signal.removeEventListener('abort', onAbort)
    stop.abort()
  }
}

async function workerOr(host: Host, alias: unknown): Promise<Worker | string> {
  const all = await loadWorkers(host)
  const w = typeof alias === 'string' ? all[alias] : undefined
  if (w) return w
  const names = Object.keys(all)
  return names.length ? `No worker named ${String(alias)}. Known workers: ${names.join(', ')}.` : 'No workers registered. Ask the user to run /a2a add <url>.'
}

export const register: Register = (on, options) => {
  const settingTokens = parseTokens(options.tokens)

  on('session.start', async ($, e, next) => {
    await Promise.all([
      ...TOOLS.map(t => $.tool.register(t)),
      $.command.register({ name: 'a2a', description: 'Manage A2A worker agents', argumentHint: 'add <url> [alias] [--token-setting | --token-cmd "<cmd>" | --token-file <path>] | list | remove <alias>' }),
    ])
    await resume(hostOf($, settingTokens))
    return next(e)
  })

  on('command.run', { command: 'a2a' }, async ($, e) => ({ text: e.args.trim() ? await runCommand(hostOf($, settingTokens), e.args) : USAGE }))

  on('tool.call', { tool: 'mcp__a2a-mod__workers' }, async $ => {
    const all = Object.values(await loadWorkers(hostOf($, settingTokens)))
    if (!all.length) return { result: 'No workers registered. Ask the user to run /a2a add <url>.' }
    return { result: all.map(w => `${w.alias}: ${w.name}. ${w.description}\n  skills: ${w.skills.map(s => `${s.id} (${s.description || s.name})`).join('; ') || 'none listed'}`).join('\n') }
  })

  on('tool.call', { tool: 'mcp__a2a-mod__send' }, async ($, e, next) => {
    const input = e as unknown as { worker?: string; message?: string; taskId?: string; contextId?: string }
    const host = hostOf($, settingTokens)
    const w = await workerOr(host, input.worker)
    if (typeof w === 'string') return { result: w }
    const startedAt = await host.now()
    const call = (state: RecentState, taskId?: string) => noteCall(host, e.tool_use_id, { worker: w.alias, state, startedAt, ...(taskId ? { taskId } : {}) })
    await call('submitted')
    try {
      const fetch = host.fetch
      const t = await bounded($, next.budget.remainingMs, next.signal, w.alias, targetOf(host, w))
      let out = await bounded($, next.budget.remainingMs, next.signal, w.alias, send(fetch, t, { text: String(input.message ?? ''), taskId: input.taskId, contextId: input.contextId }))
      // A send answered with a message has no task id; its row is keyed by the call instead.
      const id = out.kind === 'task' ? out.taskId : e.tool_use_id
      await noteSent(host, { worker: w.alias, taskId: id, contextId: out.contextId, text: String(input.message ?? ''), state: out.kind === 'task' ? out.state : 'working' }, 'claude')
      for (const ms of INLINE_POLLS_MS) {
        if (out.kind !== 'task' || !isLive(out.state)) break
        if (next.budget.remainingMs - ms < BUDGET_RESERVE_MS) break
        try { await $.clock.sleep(ms, { signal: next.signal }) } catch { break }
        // A slow poll keeps the last state, so the task is still tracked below.
        try { out = await bounded($, next.budget.remainingMs, next.signal, w.alias, getTask(fetch, t, out.taskId)) } catch (err) { if (err instanceof A2AError) { noteFailure(w, err); break } throw err }
      }
      if (out.kind === 'task' && isLive(out.state)) {
        await track(host, { worker: w.alias, taskId: out.taskId, contextId: out.contextId, state: out.state, startedAt })
        await noteState(host, w.alias, out.taskId, out.state, out.text)
        await call(out.state, out.taskId)
        return { result: `${w.alias} is working on it (task ${out.taskId}, ${out.state}). You will get a message when it finishes; do not poll. Carry on with other work.` }
      }
      const state = out.kind === 'task' ? out.state : 'completed'
      await noteState(host, w.alias, id, state, out.text)
      await call(state, out.kind === 'task' ? out.taskId : undefined)
      await showStatus(host)
      return { result: describeOutcome(w.alias, out) }
    } catch (err) {
      noteFailure(w, err)
      await call('failed')
      if (err instanceof A2AError) return { result: `a2a: ${err.message}` }
      throw err
    }
  })

  on('tool.call', { tool: 'mcp__a2a-mod__task' }, async ($, e, next) => {
    const input = e as unknown as { worker?: string; taskId?: string; cancel?: boolean }
    const host = hostOf($, settingTokens)
    const w = await workerOr(host, input.worker)
    if (typeof w === 'string') return { result: w }
    try {
      const fetch = host.fetch
      const t = await bounded($, next.budget.remainingMs, next.signal, w.alias, targetOf(host, w))
      const out = await bounded($, next.budget.remainingMs, next.signal, w.alias, input.cancel ? cancelTask(fetch, t, String(input.taskId)) : getTask(fetch, t, String(input.taskId)))
      return { result: describeOutcome(w.alias, out, FULL_MAX) }
    } catch (err) {
      noteFailure(w, err)
      if (err instanceof A2AError) return { result: `a2a: ${err.message}` }
      throw err
    }
  })
}
