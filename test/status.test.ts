import { test, expect, mock } from 'claude-code/testing'
import { fakeHost, fakeNet, STORE, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import type { Fetcher } from '../hooks/client.ts'
import { resume, showStatus, tick, track } from '../hooks/tracker.ts'
import { spinner } from '../hooks/ui/fx.ts'
import { DONE_MS, statusText } from '../hooks/ui/status.ts'
import type { RecentTask } from '../types/index.d.ts'

const row = (over: Partial<RecentTask> = {}): RecentTask =>
  ({ worker: 'fake', taskId: 't', text: 'slow 20 build', state: 'working', startedAt: 0, changedAt: 0, ...over })

test('one running task: glyph, alias, text and elapsed time', () => {
  expect(statusText([row()], 12_000, true)).toBe(`a2a ${spinner(12)} fake slow 20 build 0:12`)
  expect(statusText([row()], 12_000, false)).toBe('a2a ● fake slow 20 build 0:12')
})

test('the task text is cut to 32 characters', () => {
  const text = statusText([row({ text: 'x'.repeat(80) })], 0, false)!
  expect(text).toBe(`a2a ● fake ${'x'.repeat(31)}… 0:00`)
})

test('several running tasks, with the waiting ones counted after them', () => {
  expect(statusText([row({ taskId: 'a' }), row({ taskId: 'b' })], 0, false)).toBe('a2a ● 2 running')
  expect(statusText([row({ taskId: 'a' }), row({ taskId: 'b' }), row({ taskId: 'c', state: 'input-required' })], 0, false)).toBe('a2a ● 2 running · 1 waiting')
  expect(statusText([row(), row({ taskId: 'w', state: 'input-required' })], 3000, false)).toBe('a2a ● fake slow 20 build 0:03 · 1 waiting')
})

test('waiting with nothing running shows the question, or a count', () => {
  const ask = row({ state: 'input-required', result: 'which colour' })
  expect(statusText([ask], 0, true)).toBe('a2a ? fake waiting: which colour')
  expect(statusText([ask, { ...ask, taskId: 'b' }], 0, true)).toBe('a2a ? 2 waiting')
  expect(statusText([row({ state: 'input-required', result: 'q'.repeat(60) })], 0, true)).toBe(`a2a ? fake waiting: ${'q'.repeat(31)}…`)
})

test('a finished task shows for five seconds when nothing else is live', () => {
  const done = (state: RecentTask['state']) => row({ state, startedAt: 0, endedAt: 20_000 })
  expect(statusText([done('completed')], 20_000, true)).toBe('a2a ✓ fake done 0:20')
  expect(statusText([done('failed')], 21_000, true)).toBe('a2a ✕ fake failed 0:20')
  expect(statusText([done('canceled')], 22_000, true)).toBe('a2a ⊘ fake canceled 0:20')
  expect(statusText([done('rejected')], 22_000, true)).toBe('a2a ✕ fake failed 0:20')
  expect(statusText([done('completed')], 20_000 + DONE_MS - 1, true)).toBeDefined()
  expect(statusText([done('completed')], 20_000 + DONE_MS, true)).toBeUndefined()
  expect(statusText([row({ state: 'completed', endedAt: 1000 }), row({ taskId: 'x' })], 2000, false)).toBe('a2a ● fake slow 20 build 0:02')
})

test('control characters and escape codes never reach the status text', () => {
  const dirty = '\u001b[31mred\u0007\r\nblue\u001b]0;title\u0007'
  for (const text of [
    statusText([row({ text: dirty })], 0, true)!,
    statusText([row({ state: 'input-required', result: dirty })], 0, true)!,
    statusText([row({ worker: dirty, state: 'completed', endedAt: 0 })], 0, true)!,
  ]) expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
})

const answer = (body: object): Fetcher => async () => ({ status: 200, ok: true, text: JSON.stringify(body) })

test('one 1 s ticker runs while a task runs, steps the line, and stops when nothing is live', async () => {
  const fx = fakeHost(answer(f.v1_get_completed), [], { recent: [row({ taskId: 'live' })] })
  await track(fx.host, { worker: 'fake', taskId: 'live', state: 'working', startedAt: 0 })
  expect(fx.statusTimer.fn).toBeDefined()
  expect(fx.statuses.at(-1)).toBe(`a2a ${spinner(0)} fake slow 20 build 0:00`)
  fx.clock.now = 1000
  await fx.statusTimer.fn!()
  expect(fx.statuses.at(-1)).toBe(`a2a ${spinner(1)} fake slow 20 build 0:01`)

  await tick(fx.host)
  expect(fx.statuses.at(-1)).toMatch(/^a2a ✓ fake done /)
  expect(fx.statusTimer.fn).toBeDefined()
  fx.clock.now = 1000 + DONE_MS
  await fx.statusTimer.fn!()
  expect(fx.statuses.at(-1)).toBeUndefined()
  expect(fx.statusTimer.fn).toBeUndefined()
})

test('a waiting task needs no ticker', async () => {
  const fx = fakeHost(answer(f.v1_get_input_required), [], { recent: [row({ state: 'input-required', result: 'Which colour?' })] })
  await showStatus(fx.host)
  expect(fx.statuses.at(-1)).toBe('a2a ? fake waiting: Which colour?')
  expect(fx.statusTimer.fn).toBeUndefined()
})

test('resume after a reload restarts the ticker for tasks that are still live', async () => {
  const fx = fakeHost(answer(f.v1_get_working), [{ worker: 'fake', taskId: 'live', state: 'working', startedAt: 0, failures: 0 }], { recent: [row({ taskId: 'live' })] })
  expect(fx.statusTimer.fn).toBeUndefined()
  await resume(fx.host)
  expect(fx.statusTimer.fn).toBeDefined()
  expect(fx.statuses.at(-1)).toMatch(/^a2a . fake slow 20 build/)
})

test('a session start finds the ticker again after a reload', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } })
  on('tool.register', async (_$, e) => ({ value: { tool: e.name } }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'slow 60 build' })
  await clock.advance(7500)
  await p
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  const before = statuses.length
  await clock.advance(3000)
  expect(statuses.length).toBeGreaterThan(before)
  expect(statuses.at(-1)).toMatch(/^a2a . fake slow 60 build 0:\d\d$/)
})

test('a token a worker echoed in its question never reaches the status line', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } })
  fakeNet(on, { send: f.v1_send_ask, get: JSON.parse(JSON.stringify(f.v1_get_input_required).replace('Which colour?', 'Which s3cret?')) })
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'ask colour' })
  await clock.advance(7500)
  await p
  expect(statuses.at(-1)).toBe('a2a ? fake waiting: Which [token]?')
  expect(statuses.join('\n')).not.toContain('s3cret')
})
