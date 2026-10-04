import { test, expect, mock } from 'claude-code/testing'
import { fakeHost, fakeNet, memState, runA2a, STORE, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import type { Fetcher } from '../hooks/client.ts'
import { printable } from '../hooks/format.ts'
import { noteSent, noteState, put, progressOf, RECENT_MAX, RESULT_MAX, SHOW_MS, TEXT_MAX, visible } from '../hooks/recent.ts'
import { tick } from '../hooks/tracker.ts'
import type { RecentTask } from '../types/index.d.ts'

const row = (taskId: string, over: Partial<RecentTask> = {}): RecentTask =>
  ({ worker: 'fake', taskId, text: `job ${taskId}`, state: 'working', startedAt: 0, changedAt: 0, ...over })

const answer = (body: object): Fetcher => async () => ({ status: 200, ok: true, text: JSON.stringify(body) })

const ASK_ID = f.v1_send_ask.result.task.id
// The worker after a reply: the asking task, running again.
const SLOW_ID = f.v1_send_slow.result.task.id
const resumed = JSON.parse(JSON.stringify(f.v1_send_slow).replaceAll(SLOW_ID, ASK_ID))
const resumedGet = JSON.parse(JSON.stringify(f.v1_get_working).replaceAll(SLOW_ID, ASK_ID))

test('put keeps a changed row in place and puts a new one on top', () => {
  const list = put(put([], 'a', () => row('a')), 'b', () => row('b'))
  expect(list.map(t => t.taskId)).toEqual(['b', 'a'])
  expect(put(list, 'a', t => t && { ...t, state: 'completed' }).map(t => [t.taskId, t.state])).toEqual([['b', 'working'], ['a', 'completed']])
})

test('past 50 rows the oldest finished go first, and running or waiting rows stay', () => {
  let list: RecentTask[] = [row('wait', { state: 'input-required' }), row('run')]
  for (let i = 0; i < RECENT_MAX; i++) list = put(list, `done${i}`, () => row(`done${i}`, { state: 'completed', endedAt: 1 }))
  expect(list.length).toBe(RECENT_MAX)
  expect(list.some(t => t.taskId === 'wait')).toBe(true)
  expect(list.some(t => t.taskId === 'run')).toBe(true)
  expect(list.some(t => t.taskId === 'done0')).toBe(false)
})

test('finished rows show for 10 minutes; running and waiting rows always', () => {
  const list = [row('old', { state: 'completed', endedAt: 0 }), row('new', { state: 'failed', endedAt: SHOW_MS }), row('wait', { state: 'input-required' })]
  expect(visible(list, SHOW_MS + 1).map(t => t.taskId)).toEqual(['new', 'wait'])
})

test('worker text loses escape sequences and control characters, and keeps tabs and newlines', () => {
  expect(printable('\x1b[32mPASS\x1b[0m 12 tests\r\n\tdone\x07')).toBe('PASS 12 tests\n\tdone')
  expect(printable('\x1b]8;;https://x.test\x07link\x1b]8;;\x07')).toBe('link')
})

test('progress is the first N% in the status text', () => {
  expect(progressOf('step 3: 42% done')).toBe(42)
  expect(progressOf('no number')).toBeUndefined()
  expect(progressOf('900%')).toBeUndefined()
})

test('a tick records each state change, the result once it ends, and the run time', async () => {
  const fx = fakeHost(answer(f.v1_get_completed), [{ worker: 'fake', taskId: f.v1_get_completed.result.id, state: 'working', startedAt: 0, failures: 0 }], {
    now: 4000, recent: [row(f.v1_get_completed.result.id)],
  })
  await tick(fx.host)
  expect(fx.recent()[0]).toMatchObject({ state: 'completed', endedAt: 4000, result: 'echo: hi' })
  expect(fx.durations()).toEqual({ fake: [4000] })
})

test('a result over 10,000 characters is cut for the pane', async () => {
  const fx = fakeHost(answer(f.v1_get_completed))
  await noteState(fx.host, 'fake', 't1', 'completed', 'x'.repeat(RESULT_MAX + 50))
  expect(fx.recent()[0]?.result?.length).toBe(RESULT_MAX)
})

test('the message that started a task is kept to 500 characters, so a full pane stays under the tree limit', async () => {
  const fx = fakeHost(answer({}))
  await noteSent(fx.host, { worker: 'fake', taskId: 't1', text: 'm'.repeat(5000), state: 'working' })
  expect(fx.recent()[0]?.text.length).toBe(TEXT_MAX)
  expect(TEXT_MAX).toBe(500)
})

test('a running task keeps its latest status message, cut to 500 characters, and drops it once it ends', async () => {
  const fx = fakeHost(answer({}))
  await noteState(fx.host, 'fake', 't1', 'working', `step 2 of 5\u0007${'x'.repeat(600)}`)
  expect(fx.recent()[0]?.message?.length).toBe(TEXT_MAX)
  expect(fx.recent()[0]?.message).toMatch(/^step 2 of 5x/)
  await noteState(fx.host, 'fake', 't1', 'completed', 'done')
  expect(fx.recent()[0]).not.toHaveProperty('message')
})

test('a task that asks a question stays listed as waiting, is not polled, and shows in the status line', async () => {
  let polls = 0
  const fetch: Fetcher = async () => { polls++; return { status: 200, ok: true, text: JSON.stringify(f.v1_get_input_required) } }
  const fx = fakeHost(fetch, [{ worker: 'fake', taskId: ASK_ID, state: 'working', startedAt: 0, failures: 0 }], { recent: [row(ASK_ID)] })
  await tick(fx.host)
  expect(fx.recent()[0]).toMatchObject({ state: 'input-required', result: 'Which colour?' })
  expect(fx.tasks()).toEqual([])
  expect(fx.statuses.at(-1)).toBe('a2a ? fake waiting: Which colour?')
  expect(fx.wakes[0]).toContain('input-required')
  await tick(fx.host)
  expect(polls).toBe(1)
})

test('the first answer to a waiting task is the one kept', async () => {
  const fx = fakeHost(answer({}), [], { recent: [row(ASK_ID, { state: 'input-required' })] })
  await noteSent(fx.host, { worker: 'fake', taskId: ASK_ID, text: 'blue', state: 'working' }, 'user')
  await noteSent(fx.host, { worker: 'fake', taskId: ASK_ID, text: 'red', state: 'working' }, 'claude')
  expect(fx.recent()[0]).toMatchObject({ state: 'working', answeredBy: 'user', text: `job ${ASK_ID}` })
})

test('a removed worker marks its tracked rows removed', async () => {
  const fx = fakeHost(answer({}), [{ worker: 'gone', taskId: 't1', state: 'working', startedAt: 0, failures: 0 }], { recent: [row('t1', { worker: 'gone' })] })
  await tick(fx.host)
  expect(fx.recent()[0]).toMatchObject({ state: 'removed', result: 'worker removed' })
})

test('send writes the call and the row; a reply to a waiting task tracks it again', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const st = memState(on)
  let replied = false
  fakeNet(on, { send: () => (replied ? resumed : f.v1_send_ask), get: () => (replied ? resumedGet : f.v1_get_input_required) })

  const first = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'ask colour' })
  await clock.advance(7500)
  expect(String((await first).result)).toContain('input-required')
  expect(Object.values(st.calls())[0]).toMatchObject({ worker: 'fake', taskId: ASK_ID, state: 'input-required' })
  expect(st.recent()[0]).toMatchObject({ taskId: ASK_ID, text: 'ask colour', state: 'input-required', result: 'Which colour?' })
  expect(st.tasks()).toEqual([])

  replied = true
  const second = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'blue', taskId: ASK_ID })
  await clock.advance(7500)
  await second
  expect(st.recent()[0]).toMatchObject({ taskId: ASK_ID, state: 'working', answeredBy: 'claude' })
  expect(st.tasks().map(t => t.taskId)).toEqual([ASK_ID])
})

test('/a2a remove marks the worker\'s waiting rows removed', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const st = memState(on)
  fakeNet(on, { send: f.v1_send_ask, get: f.v1_get_input_required })
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'ask colour' })
  await clock.advance(7500)
  await p
  await runA2a($, 'remove fake')
  expect(st.recent()[0]).toMatchObject({ state: 'removed', result: 'worker removed' })
})
