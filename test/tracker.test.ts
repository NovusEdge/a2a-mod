import { test, expect, mock, type Engine, type MockClock } from 'claude-code/testing'
import { fakeHost, fakeNet, runA2a, STORE, WITH_TOKEN, type On } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import type { Fetcher } from '../hooks/client.ts'
import { MAX_FAILURES, resume, tick, track } from '../hooks/tracker.ts'

const leaky = JSON.parse(JSON.stringify(f.v1_get_completed).replace('echo: hi', 'echo: s3cret'))

function prompts(on: On) {
  const seen: string[] = []
  on('prompt.submit', async (_$, e) => { seen.push(e.text); return { text: e.text } })
  return seen
}

async function sendSlow($: Engine, clock: MockClock, message = 'slow 60 build') {
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message })
  await clock.advance(7500)
  return String((await p).result)
}

test('a slow task is tracked, then wakes Claude once with the result', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const woke = prompts(on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? leaky : f.v1_get_working) })

  expect(await sendSlow($, clock)).toContain('You will get a message')
  done = true
  await clock.advance(5000)
  expect(woke.length).toBe(1)
  expect(woke[0]).toContain('completed')
  expect(woke[0]).not.toContain('s3cret')
  await clock.advance(20000)
  expect(woke.length).toBe(1)
})

test('two tasks finishing in one tick make one prompt, and both were kept', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const woke = prompts(on)
  let n = 0
  let done = false
  const slow = () => JSON.parse(JSON.stringify(f.v1_send_slow).replace(/"id":"[^"]+"/, `"id":"t${++n}"`))
  fakeNet(on, { send: slow, get: () => (done ? f.v1_get_completed : f.v1_get_working) })
  const a = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'slow 60 a' })
  const b = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'slow 60 b' })
  await clock.advance(7500)
  await Promise.all([a, b])
  done = true
  await clock.advance(5000)
  expect(woke.length).toBe(1)
  expect((woke[0]!.match(/task /g) ?? []).length).toBe(2)
})

test('a worker that stops answering is dropped after six failures', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const woke = prompts(on)
  const net = fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
  await sendSlow($, clock)
  net.state.down = true
  for (let i = 0; i < 5; i++) await clock.advance(5000)
  expect(woke.length).toBe(0)
  await clock.advance(5000)
  expect(woke.length).toBe(1)
  expect(woke[0]).toContain('lost contact')
})

test('status line shows the running task, then its end for five seconds, then clears', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } })
  prompts(on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? f.v1_get_completed : f.v1_get_working) })
  await sendSlow($, clock)
  expect(statuses.at(-1)).toMatch(/^a2a . fake slow 60 build 0:\d\d$/)
  done = true
  await clock.advance(5000)
  expect(statuses.at(-1)).toMatch(/^a2a ✓ fake done 0:\d\d$/)
  await clock.advance(5000)
  expect(statuses.at(-1)).toBeUndefined()
})

test('/a2a list shows running tasks', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  prompts(on)
  fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
  await sendSlow($, clock)
  const out = (await runA2a($, 'list')).text
  expect(out).toContain('Running:')
  expect(out).toContain(`fake ${f.v1_send_slow.result.task.id} working`)
})

test('session.start while a task is tracked keeps a single poller', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const woke = prompts(on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? f.v1_get_completed : f.v1_get_working) })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await sendSlow($, clock)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  done = true
  await clock.advance(5000)
  await clock.advance(20000)
  expect(woke.length).toBe(1)
})

// A reload is shown against a fake Host: fresh module state (no ticker) plus tasks left in state.

test('resume restarts polling for tasks a reload left in state', async () => {
  const fetch: Fetcher = async () => ({ status: 200, ok: true, text: JSON.stringify(f.v1_get_completed) })
  const { host, wakes, timer, tasks } = fakeHost(fetch, [{ worker: 'fake', taskId: 'left-over', state: 'working', startedAt: 0, failures: 0 }])
  expect(timer.fn).toBeUndefined()
  await resume(host)
  expect(timer.fn).toBeDefined()
  await tick(host)
  expect(wakes.length).toBe(1)
  expect(tasks().length).toBe(0)
  expect(timer.fn).toBeUndefined()
})

test('a hung worker times out per poll, does not hold up other tasks, and is dropped after six', async () => {
  const fetch: Fetcher = (_url, init) => JSON.parse(init.body ?? '{}').params?.id === 'hung'
    ? new Promise(() => {})
    : Promise.resolve({ status: 200, ok: true, text: JSON.stringify(f.v1_get_completed) })
  const { host, wakes, tasks } = fakeHost(fetch)
  await track(host, { worker: 'fake', taskId: 'hung', state: 'working', startedAt: 0 })
  await track(host, { worker: 'fake', taskId: 'quick', state: 'working', startedAt: 0 })

  await tick(host)
  expect(wakes.length).toBe(1)
  expect(wakes[0]).toContain('completed')
  expect(tasks().map(t => [t.taskId, t.failures])).toEqual([['hung', 1]])

  for (let i = 1; i < MAX_FAILURES; i++) await tick(host)
  expect(tasks().length).toBe(0)
  expect(wakes.at(-1)).toContain('lost contact')
  expect(wakes.length).toBe(2)
})
