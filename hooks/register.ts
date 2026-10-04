import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer, UiCopyResult } from 'claude-code'
import type { PaneView, RecentState, RecentTask, SentReply, Worker } from '../types/index.d.ts'
import { A2AError, cancelTask, getTask, send } from './client.ts'
import { runCommand, USAGE } from './command.ts'
import { describeOutcome, FULL_MAX } from './format.ts'
import { changeRecent, isWaiting, noteCall, noteSent, noteState, readRecent, visible } from './recent.ts'
import { loadWorkers, noteFailure, parseTokens, targetOf, type Host, type SettingTokens } from './registry.ts'
import { resume, showStatus, track } from './tracker.ts'
import { palette, type Palette } from './ui/color.ts'
import { bandRows, bandTree, nextRedraw } from './ui/band.tsx'
import { resultCard, textOf, useCard, wakeCard, wakeNotes } from './ui/cards.tsx'
import { paneTree, type PaneActions } from './ui/pane.tsx'
import { parseSettings, type UiSettings } from './ui/settings.ts'
import { isLive } from './wire.ts'

type Engine = EngineInterface

const TASKS = { plugin: 'a2a-mod', key: 'tasks' } as const
const RECENT = { plugin: 'a2a-mod', key: 'recent' } as const
const CALLS = { plugin: 'a2a-mod', key: 'calls' } as const
const PANE = { id: 'a2a-workers', title: 'A2A workers' } as const
// Wanted sizes: a slim dock beside /diff, a short block when inline.
const PANE_COLUMNS = 32
const PANE_ROWS = 12
const paneView = atom({ plugin: 'a2a-mod', key: 'pane' } as const, { open: [], replying: [] } as PaneView)
const replies = atom({ plugin: 'a2a-mod', key: 'replies' } as const, [] as SentReply[])
const played = atom({ plugin: 'a2a-mod', key: 'played' } as const, [] as string[])
const PLAYED_MAX = 200
const TOKEN_CMD_TIMEOUT_MS = 10_000
// A pane button's own deadline for the worker calls it makes.
const PRESS_MS = 9000
const NOT_COPIED: Record<Extract<UiCopyResult, { isCopied: false }>['reason'], string> = {
  'no-surface': 'nothing is drawing',
  'no-clipboard': 'this surface has no clipboard Claude Code can write to',
  refused: 'another mod refused it',
}

// The status line and the band age by this clock, so a test's mock clock moves them. Another mod's
// clock.now hook may refuse; the wall clock is the fallback.
async function nowOf($: Engine): Promise<number> {
  try { return await $.clock.now() } catch { return Date.now() }
}

function hostOf($: Engine, settingTokens: SettingTokens, ui: UiSettings): Host {
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
    anim: ui.animations,
    now: () => nowOf($),
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

async function paletteOf($: Engine): Promise<Palette> {
  // Another mod's config.list hook may refuse or fail; the dark palette is the fallback.
  try { return palette((await $.config.list()).find(row => row.key === 'theme')?.value) } catch { return palette(undefined) }
}

const without = (ids: string[], id: string) => ids.filter(x => x !== id)

const cardWidth = (columns: number | undefined) => Math.max(20, Math.min(100, (columns ?? 80) - 4))

async function cancelFromPane($: Engine, host: Host, t: RecentTask): Promise<void> {
  const w = (await loadWorkers(host))[t.worker]
  if (!w) { $.ui.toast(`a2a: ${t.worker} was removed.`); return }
  await changeRecent(host, t.taskId, held => held && { ...held, canceling: true })
  const until = Date.now() + PRESS_MS
  const never = new AbortController().signal
  try {
    const target = await bounded($, until - Date.now(), never, w.alias, targetOf(host, w))
    await bounded($, until - Date.now(), never, w.alias, cancelTask(host.fetch, target, t.taskId))
    // A waiting task is not polled. Tracking it again lets the next poll report the end and wake Claude.
    if (isWaiting(t.state)) await track(host, { worker: w.alias, taskId: t.taskId, contextId: t.contextId, state: 'working', startedAt: t.startedAt })
  } catch (err) {
    noteFailure(w, err)
    await changeRecent(host, t.taskId, held => { if (!held) return held; const { canceling, ...rest } = held; return rest })
    if (err instanceof A2AError) $.ui.toast(`a2a: ${err.message}`)
    else throw err
  }
}

async function replyFromPane($: Engine, host: Host, t: RecentTask, text: string): Promise<boolean> {
  const w = (await loadWorkers(host))[t.worker]
  if (!w) { $.ui.toast(`a2a: ${t.worker} was removed.`); return false }
  const until = Date.now() + PRESS_MS
  const never = new AbortController().signal
  try {
    const target = await bounded($, until - Date.now(), never, w.alias, targetOf(host, w))
    const out = await bounded($, until - Date.now(), never, w.alias, send(host.fetch, target, { text, taskId: t.taskId, contextId: t.contextId }))
    const state = out.kind === 'task' ? out.state : 'completed'
    await noteSent(host, { worker: w.alias, taskId: t.taskId, contextId: out.contextId, text, state }, 'user')
    if (out.kind === 'task' && isLive(out.state)) {
      await track(host, { worker: w.alias, taskId: t.taskId, contextId: out.contextId, state: out.state, startedAt: t.startedAt })
      return true
    }
    // Claude heard the question, not this answer, so an answer that ends the task wakes it.
    await noteState(host, w.alias, t.taskId, state, out.text)
    await showStatus(host)
    await host.wake(`A2A task finished:\n\n${describeOutcome(w.alias, out)}`)
    return true
  } catch (err) {
    noteFailure(w, err)
    if (err instanceof A2AError) { $.ui.toast(`a2a: ${err.message}`); return false }
    throw err
  }
}

export const register: Register = (on, options) => {
  const settingTokens = parseTokens(options.tokens)
  const ui = parseSettings(options)
  // Not in $.state: a write per keystroke would redraw the pane under the person's typing.
  const drafts = new Map<string, string>()
  let paneExpiry: Timer | undefined
  let bandExpiry: Timer | undefined

  on('session.start', async ($, e, next) => {
    await Promise.all([
      ...TOOLS.map(t => $.tool.register(t)),
      $.command.register({ name: 'a2a', description: 'Manage A2A worker agents', argumentHint: 'add <url> [alias] [--token-setting | --token-cmd "<cmd>" | --token-file <path>] | list | remove <alias>' }),
    ])
    await resume(hostOf($, settingTokens, ui))
    // The engine keeps a pane open across reloads, so one opened under another layout would stay.
    if (ui.layout === 'minimal') try { await $.ui.close({ id: PANE.id }) } catch {}
    return next(e)
  })

  on('command.run', { command: 'a2a' }, async ($, e) => {
    if (e.args.trim()) return { text: await runCommand(hostOf($, settingTokens, ui), e.args) }
    // Only the person opens the pane, so a running task never switches the dock away from /diff.
    // Asked, it is placed at any width; another mod's ui.open hook may still deny it.
    if (ui.layout !== 'minimal') try { await $.ui.open({ ...PANE, columns: PANE_COLUMNS, rows: PANE_ROWS }) } catch {}
    return { text: USAGE }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const sent = await read($, replies)
    if (!sent.length) return next(e)
    await update($, replies, () => [])
    const told = sent.map(r => `You answered ${r.worker}'s question on task ${r.taskId}: "${r.text}"`)
    return next({ ...e, context: [...(e.context ?? []), ...told] })
  })

  on('ui.render', { component: 'ToolUse', props: { tool: 'mcp__a2a-mod__send' } }, async ($, e, next) => {
    if (ui.layout !== 'full') return next(e)
    const host = hostOf($, settingTokens, ui)
    const input = (e.props.input ?? {}) as { worker?: unknown; message?: unknown }
    const alias = String(input.worker ?? '')
    const [workers, calls, pal] = await Promise.all([loadWorkers(host), host.readCalls(), paletteOf($)])
    const now = await nowOf($)
    return useCard($.ui.resolve(e), {
      surface: e.surface, width: cardWidth(e.viewport?.columns), anim: ui.animations, pal, now, alias, worker: workers[alias],
      message: String(input.message ?? ''), isRunning: e.props.isRunning, startedAt: calls.value?.[e.props.tool_use_id]?.startedAt ?? now,
    })
  })

  on('ui.render', { component: 'ToolResult', props: { tool: 'mcp__a2a-mod__send' } }, async ($, e, next) => {
    if (ui.layout !== 'full') return next(e)
    const host = hostOf($, settingTokens, ui)
    const [calls, done] = await Promise.all([host.readCalls(), read($, played)])
    const call = calls.value?.[e.props.tool_use_id]
    const playId = call?.taskId ?? e.props.tool_use_id
    return resultCard($.ui.resolve(e), { surface: e.surface, anim: ui.animations, state: call?.state, isErrored: e.props.isErrored, text: textOf(e.props.output), playId, played: done.includes(playId) })
  })

  // The band is shared: another mod may draw there, and the first tree in the chain wins. So it
  // draws only while a task runs or waits (and for the return packet after), yields to surveys,
  // and stacks next(e)'s tree under its own.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (ui.layout !== 'full' || e.props.hasSurvey) return next(e)
    const now = await nowOf($)
    const rows = bandRows(await readRecent(hostOf($, settingTokens, ui)), now)
    if (!rows.length) return next(e)
    // The return packet rests with no state change to redraw the band, so a timer does it.
    bandExpiry?.cancel()
    const due = nextRedraw(rows, now, true)
    bandExpiry = due === undefined ? undefined : $.clock.after(due, () => $.ui.invalidate('ui.render'))
    const [pal, theirs] = await Promise.all([paletteOf($), next(e)])
    return bandTree($.ui.resolve(e), { surface: e.surface, width: e.props.bodyColumns, now, anim: ui.animations, pal, rows }, theirs)
  })

  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'plugin' } } }, async ($, e, next) => {
    const o = e.props.origin
    // While expanded (ctrl+o) the engine draws the raw message.
    if (ui.layout !== 'full' || e.props.isExpanded || o.kind !== 'plugin' || o.name !== 'a2a-mod') return next(e)
    const notes = wakeNotes(e.props.text)
    if (!notes) return next(e)
    const [list, done, pal] = await Promise.all([readRecent(hostOf($, settingTokens, ui)), read($, played), paletteOf($)])
    return wakeCard($.ui.resolve(e), {
      surface: e.surface, anim: ui.animations, pal,
      // The state the message reported, not the row's state now: the card is a record of that moment.
      notes: notes.map(n => ({ ...n, state: n.state ?? list.find(t => t.taskId === n.taskId)?.state, played: n.taskId !== undefined && done.includes(n.taskId) })),
    })
  })

  on('ui.message', async ($, e) => {
    const id = (e.data as { played?: unknown } | null)?.played
    if (typeof id === 'string') await update($, played, ids => (ids.includes(id) ? ids : [...ids, id].slice(-PLAYED_MAX)))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: 'a2a-workers' }, async ($, e) => {
    const host = hostOf($, settingTokens, ui)
    const now = await nowOf($)
    const [workers, list, view, durations, pal] = await Promise.all([loadWorkers(host), readRecent(host), read($, paneView), host.readDurations(), paletteOf($)])
    const act: PaneActions = {
      cancel: t => cancelFromPane($, host, t),
      // One row open at a time keeps the pane under the engine's 100,000-character tree limit.
      toggleOpen: t => update($, paneView, v => ({ ...v, open: v.open.includes(t.taskId) ? [] : [t.taskId] })),
      copy: async (t, press) => {
        const copied = await $.ui.copy({ text: t.result ?? '', surface: press.surface })
        if (!copied.isCopied) $.ui.toast(`a2a: nothing was copied: ${NOT_COPIED[copied.reason]}.`)
      },
      startReply: async t => {
        await update($, paneView, v => ({ ...v, replying: [...without(v.replying, t.taskId), t.taskId] }))
        // autoFocus applies only when the pane takes the keyboard, and a press does not hand it over.
        // The field shows either way: claude plugin test 2.1.288 rejects every $.ui.focus.
        try { await $.ui.focus({ requestId: PANE.id, key: `input:${t.taskId}` }) } catch {}
      },
      draft: (t, text) => { drafts.set(t.taskId, text) },
      send: async (t, text) => {
        if (!text.trim() || !(await replyFromPane($, host, t, text))) return
        drafts.delete(t.taskId)
        await update($, paneView, v => ({ ...v, replying: without(v.replying, t.taskId) }))
        await update($, replies, r => [...r, { worker: t.worker, taskId: t.taskId, text }])
      },
      discard: async t => {
        drafts.delete(t.taskId)
        await update($, paneView, v => ({ ...v, replying: without(v.replying, t.taskId) }))
      },
    }
    const shown = Object.values(workers).sort((a, b) => a.addedAt - b.addedAt)
    const rows = visible(list, now)
    // A row ages out with no state change to redraw the pane, so a timer does it.
    paneExpiry?.cancel()
    const due = nextRedraw(rows, now, false)
    paneExpiry = due === undefined ? undefined : $.clock.after(due, () => $.ui.invalidate('ui.render'))
    return paneTree($.ui.resolve(e), { surface: e.surface, width: e.props.bodyColumns, now, anim: ui.animations, pal, workers: shown, rows, durations, view, drafts }, act)
  })

  on('tool.call', { tool: 'mcp__a2a-mod__workers' }, async $ => {
    const all = Object.values(await loadWorkers(hostOf($, settingTokens, ui)))
    if (!all.length) return { result: 'No workers registered. Ask the user to run /a2a add <url>.' }
    return { result: all.map(w => `${w.alias}: ${w.name}. ${w.description}\n  skills: ${w.skills.map(s => `${s.id} (${s.description || s.name})`).join('; ') || 'none listed'}`).join('\n') }
  })

  on('tool.call', { tool: 'mcp__a2a-mod__send' }, async ($, e, next) => {
    const input = e as unknown as { worker?: string; message?: string; taskId?: string; contextId?: string }
    const host = hostOf($, settingTokens, ui)
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
    const host = hostOf($, settingTokens, ui)
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
