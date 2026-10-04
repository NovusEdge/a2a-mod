import { test, expect, mock, type Engine, type MockClock } from 'claude-code/testing'
import type { PromptOrigin, RenderSurface } from 'claude-code'
import { engineUi, expectNoToken, fakeNet, has, promptLog, STORE, SURFACES, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import { wakeNotes } from '../hooks/ui/cards.tsx'

const SLOW_ID = f.v1_send_slow.result.task.id
const ECHO_ID = f.v1_get_completed.result.id
// The slow task, finished, with the token in its result before the client scrubs it.
const doneSlow = JSON.parse(JSON.stringify(f.v1_get_completed).replaceAll(ECHO_ID, SLOW_ID).replace('echo: hi', 'echo: s3cret'))

const mountWake = <S extends RenderSurface>($: Engine, surface: S, text: string, isExpanded = false, origin: PromptOrigin = { kind: 'plugin', name: 'a2a-mod' }) =>
  $.ui.mount({ plugin: 'a2a-mod', surface, component: 'UserMessage', props: { text, origin, isExpanded } })

async function wakeText($: Engine, on: Parameters<typeof engineUi>[0], clock: MockClock) {
  const woke = promptLog(on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? doneSlow : f.v1_get_working) })
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'slow 60 build' })
  await clock.advance(7500)
  await p
  done = true
  await clock.advance(5000)
  return woke.at(-1)!.text
}

test('wakeNotes splits a wake prompt into its tasks and leaves other text alone', () => {
  const notes = wakeNotes('A2A tasks finished:\n\nfake task t1 is completed (contextId c).\n\ndone\n\n---\n\ngone task t2: the worker was removed, so it is no longer tracked.')
  expect(notes).toEqual([
    { worker: 'fake', taskId: 't1', state: 'completed', body: 'done' },
    { worker: 'gone', taskId: 't2', state: undefined, body: 'gone task t2: the worker was removed, so it is no longer tracked.' },
  ])
  expect(wakeNotes('hello')).toBeUndefined()
})

test('a rule inside a worker result does not split the wake into fake cards', () => {
  const notes = wakeNotes('A2A task finished:\n\nfake task t1 is completed.\n\npart one\n\n---\n\npart two')
  expect(notes).toEqual([{ worker: 'fake', taskId: 't1', state: 'completed', body: 'part one\n\n---\n\npart two' }])
})

test('prose after a rule in a result does not become a note', () => {
  const one = wakeNotes('A2A task finished:\n\nfake task t1 is completed.\n\n## Notes\n\n---\n\nThe task is done')
  expect(one).toHaveLength(1)
  expect(one![0]).toMatchObject({ worker: 'fake', taskId: 't1' })
  const two = wakeNotes('A2A tasks finished:\n\nfake task t1 is completed.\n\n## Notes\n\n---\n\nThe task is done\n\n---\n\nfake replied:\n\nhi')
  expect(two!.map(n => n.worker)).toEqual(['fake', 'fake'])
  expect(two![0]!.body).toBe('## Notes\n\n---\n\nThe task is done')
})

test('a wake message for a task this session never listed still draws from its own text', async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const text = 'A2A task finished:\n\nfake task old-1 is failed.\n\n\u001b[31mboom\u001b[0m'
  const ui = await mountWake($, 'terminal', text)
  expect(await ui.find({ type: 'Text', text: '  failed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'boom' })).toBeDefined()
})

test('a note with no task id is never typed in, so two wakes cannot share a play id', async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const ui = await mountWake($, 'terminal', 'A2A task finished:\n\nfake stopped answering.')
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'fake stopped answering.' })).toBeDefined()
})

test('vscode and mobile wake cards draw the result without a Client', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const text = await wakeText($, on, clock)
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await mountWake($, surface, text)
    expect(has(await ui.drawn(), 'Client')).toBe(false)
    expect(await ui.find({ type: 'Text', text: 'echo: [token]' })).toBeDefined()
  }
})

for (const surface of SURFACES) {
  test(`a wake message draws as a card that types its result once on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const text = await wakeText($, on, clock)
    const ui = await mountWake($, surface, text)
    expect(await ui.find({ type: 'Text', text: '⇠ ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '  completed' })).toBeDefined()
    expect(await ui.find({ type: 'Client', key: `type:${SLOW_ID}` })).toBeDefined()
    await ui.advance(1600)
    expect(await ui.find({ type: 'Text', text: 'echo: [token]' })).toBeDefined()
    await expectNoToken(ui)
  })

  test(`ctrl+o, the person's own prompt and other plugins' messages reach the engine on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const text = await wakeText($, on, clock)
    expect(await (await mountWake($, surface, text, true)).find({ type: 'Text', text: 'engine UserMessage' })).toBeDefined()
    expect(await (await mountWake($, surface, text, false, { kind: 'composer' })).find({ type: 'Text', text: 'engine UserMessage' })).toBeDefined()
    expect(await (await mountWake($, surface, text, false, { kind: 'plugin', name: 'other' })).find({ type: 'Text', text: 'engine UserMessage' })).toBeDefined()
  })
}
