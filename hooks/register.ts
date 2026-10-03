import type { EngineInterface, Register } from 'claude-code'
import type { Worker } from '../types/index.d.ts'
import { A2AError, cancelTask, getTask, send } from './client.ts'
import { runCommand, USAGE } from './command.ts'
import { describeOutcome, FULL_MAX } from './format.ts'
import { loadWorkers, noteFailure, parseTokens, targetOf, type Host, type SettingTokens } from './registry.ts'
import { resume, track } from './tracker.ts'
import { isLive } from './wire.ts'

type Engine = EngineInterface

const TASKS = { plugin: 'a2a-mod', key: 'tasks' } as const
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
    status: text => $.ui.status(text),
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
    try {
      const fetch = host.fetch
      const t = await bounded($, next.budget.remainingMs, next.signal, w.alias, targetOf(host, w))
      let out = await bounded($, next.budget.remainingMs, next.signal, w.alias, send(fetch, t, { text: String(input.message ?? ''), taskId: input.taskId, contextId: input.contextId }))
      for (const ms of INLINE_POLLS_MS) {
        if (out.kind !== 'task' || !isLive(out.state)) break
        if (next.budget.remainingMs - ms < BUDGET_RESERVE_MS) break
        try { await $.clock.sleep(ms, { signal: next.signal }) } catch { break }
        // A slow poll keeps the last state, so the task is still tracked below.
        try { out = await bounded($, next.budget.remainingMs, next.signal, w.alias, getTask(fetch, t, out.taskId)) } catch (err) { if (err instanceof A2AError) { noteFailure(w, err); break } throw err }
      }
      if (out.kind === 'task' && isLive(out.state)) {
        await track(host, { worker: w.alias, taskId: out.taskId, contextId: out.contextId, state: out.state, startedAt: Date.now() })
        return { result: `${w.alias} is working on it (task ${out.taskId}, ${out.state}). You will get a message when it finishes; do not poll. Carry on with other work.` }
      }
      return { result: describeOutcome(w.alias, out) }
    } catch (err) {
      noteFailure(w, err)
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
