import type { EngineInterface, Register } from 'claude-code'
import type { Worker } from '../types/index.d.ts'
import { A2AError, cancelTask, getTask, send } from './client.ts'
import { runCommand, USAGE } from './command.ts'
import { describeOutcome } from './format.ts'
import { loadWorkers, targetOf, type Host, type TokenEnv } from './registry.ts'
import { isLive } from './wire.ts'

type Engine = EngineInterface

// Each name is spelled out because $.env.get refuses a computed one. Keep in step with TOKEN_ENVS.
function readToken($: Engine, name: TokenEnv): Promise<string | undefined> {
  switch (name) {
    case 'A2A_TOKEN_1': return $.env.get('A2A_TOKEN_1')
    case 'A2A_TOKEN_2': return $.env.get('A2A_TOKEN_2')
    case 'A2A_TOKEN_3': return $.env.get('A2A_TOKEN_3')
    case 'A2A_TOKEN_4': return $.env.get('A2A_TOKEN_4')
    case 'A2A_TOKEN_5': return $.env.get('A2A_TOKEN_5')
    case 'A2A_TOKEN_6': return $.env.get('A2A_TOKEN_6')
    case 'A2A_TOKEN_7': return $.env.get('A2A_TOKEN_7')
    case 'A2A_TOKEN_8': return $.env.get('A2A_TOKEN_8')
    case 'A2A_TOKEN_9': return $.env.get('A2A_TOKEN_9')
  }
}

function hostOf($: Engine): Host {
  return {
    fetch: (url, init) => $.http.fetch(url, init),
    readWorkers: () => $.store.get('workers'),
    writeWorkers: all => $.store.set('workers', all),
    env: name => readToken($, name),
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

async function workerOr(host: Host, alias: unknown): Promise<Worker | string> {
  const all = await loadWorkers(host)
  const w = typeof alias === 'string' ? all[alias] : undefined
  if (w) return w
  const names = Object.keys(all)
  return names.length ? `No worker named ${String(alias)}. Known workers: ${names.join(', ')}.` : 'No workers registered. Ask the user to run /a2a add <url>.'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await Promise.all([
      ...TOOLS.map(t => $.tool.register(t)),
      $.command.register({ name: 'a2a', description: 'Manage A2A worker agents', argumentHint: 'add <url> [alias] [--token-env VAR] | list | remove <alias>' }),
    ])
    return next(e)
  })

  on('command.run', { command: 'a2a' }, async ($, e) => ({ text: e.args.trim() ? await runCommand(hostOf($), e.args) : USAGE }))

  on('tool.call', { tool: 'mcp__a2a-mod__workers' }, async $ => {
    const all = Object.values(await loadWorkers(hostOf($)))
    if (!all.length) return { result: 'No workers registered. Ask the user to run /a2a add <url>.' }
    return { result: all.map(w => `${w.alias}: ${w.name}. ${w.description}\n  skills: ${w.skills.map(s => `${s.id} (${s.description || s.name})`).join('; ') || 'none listed'}`).join('\n') }
  })

  on('tool.call', { tool: 'mcp__a2a-mod__send' }, async ($, e, next) => {
    const input = e as unknown as { worker?: string; message?: string; taskId?: string; contextId?: string }
    const host = hostOf($)
    const w = await workerOr(host, input.worker)
    if (typeof w === 'string') return { result: w }
    try {
      const fetch = host.fetch
      const t = await targetOf(host, w)
      let out = await send(fetch, t, { text: String(input.message ?? ''), taskId: input.taskId, contextId: input.contextId })
      for (const ms of INLINE_POLLS_MS) {
        if (out.kind !== 'task' || !isLive(out.state)) break
        if (next.budget.remainingMs - ms < BUDGET_RESERVE_MS) break
        try { await $.clock.sleep(ms, { signal: next.signal }) } catch { break }
        out = await getTask(fetch, t, out.taskId)
      }
      if (out.kind === 'task' && isLive(out.state)) {
        return { result: `${w.alias} task ${out.taskId} is still ${out.state}. Use the task tool to check it.` }
      }
      return { result: describeOutcome(w.alias, out) }
    } catch (err) {
      if (err instanceof A2AError) return { result: `a2a: ${err.message}` }
      throw err
    }
  })

  on('tool.call', { tool: 'mcp__a2a-mod__task' }, async ($, e) => {
    const input = e as unknown as { worker?: string; taskId?: string; cancel?: boolean }
    const host = hostOf($)
    const w = await workerOr(host, input.worker)
    if (typeof w === 'string') return { result: w }
    try {
      const fetch = host.fetch
      const t = await targetOf(host, w)
      const out = input.cancel ? await cancelTask(fetch, t, String(input.taskId)) : await getTask(fetch, t, String(input.taskId))
      return { result: describeOutcome(w.alias, out) }
    } catch (err) {
      if (err instanceof A2AError) return { result: `a2a: ${err.message}` }
      throw err
    }
  })
}
