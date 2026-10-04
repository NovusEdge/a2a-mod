import { test, expect, mock, type Engine, type MockClock, type Plugin } from 'claude-code/testing'
import { engineUi, fakeNet, STORE, TOKEN, WITH_TOKEN, type On } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import { wakeDetail, wakeLine, type WakeItem } from '../hooks/format.ts'

const SLOW_ID = f.v1_send_slow.result.task.id
const doneSlow = JSON.parse(JSON.stringify(f.v1_get_completed).replaceAll(f.v1_get_completed.result.id, SLOW_ID))
const askSlow = JSON.parse(JSON.stringify(f.v1_get_input_required).replaceAll(f.v1_get_input_required.result.id, SLOW_ID))
const NOTICE = "[a2a-mod] Task-completion notice from the a2a-mod mod, not the user's words."
const OWN = { kind: 'plugin', name: 'a2a-mod', asUser: true } as const

type Seen = { text: string; context: readonly string[]; origin: { kind: string; name?: string; asUser?: true } }

const above: Plugin = {
  name: 'above',
  tier: 'prepend',
  register(on) {
    on('prompt.submit', async (_$, e, next) => next({ ...e, context: [...(e.context ?? []), 'ABOVE CONTEXT'] }))
  },
}
const below: Plugin = {
  name: 'below',
  register(on) {
    on('prompt.submit', async (_$, e, next) => next({ ...e, context: [...(e.context ?? []), 'BELOW CONTEXT'] }))
  },
}

/**
 * `sent` is what the mod submitted. The kit skips a mod's own hooks for its own submit, so a2a-mod's
 * prompt.submit hook never sees `sent`; each one is submitted again from the test's side, as another
 * caller would, and what comes out of the hook chain is `delivered`.
 */
function submits($: Engine, on: On) {
  const sent: Seen[] = []
  const delivered: Seen[] = []
  const again = new Set<string>()
  on('prompt.submit', async (_$, e) => {
    const row: Seen = { text: e.text, context: e.context ?? [], origin: e.origin as never }
    if (e.origin.kind === 'plugin' && e.origin.name === 'a2a-mod' && !again.has(e.text)) {
      again.add(e.text)
      sent.push(row)
      await $.prompt.submit({ text: e.text, origin: OWN, wait: false })
    } else if (again.has(e.text)) delivered.push(row)
    return { text: e.text }
  })
  return { sent, delivered }
}

async function slowTasks($: Engine, clock: MockClock, n = 1, message = 'slow 60 build') {
  const calls = Array.from({ length: n }, () => $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message }))
  await clock.advance(7500)
  await Promise.all(calls)
}

test('the wake is one short line submitted as the person, with no token', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const { sent } = submits($, on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? doneSlow : f.v1_get_working) })
  await slowTasks($, clock)
  done = true
  await clock.advance(5000)
  expect(sent.length).toBe(1)
  const wake = sent[0]!
  expect(wake.text).toBe(`a2a: fake task ${SLOW_ID.slice(0, 4)}… completed`)
  expect(wake.text).not.toContain('\n')
  expect([...wake.text].length).toBeLessThanOrEqual(100)
  expect(wake.origin).toMatchObject({ kind: 'plugin', name: 'a2a-mod', asUser: true })
  expect(wake.text).not.toContain(TOKEN)
})

test('Claude gets the full result as context, marked as the mod and not the user', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const { sent, delivered } = submits($, on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? doneSlow : f.v1_get_working) })
  await slowTasks($, clock)
  done = true
  await clock.advance(5000)
  expect(delivered.length).toBe(1)
  const [detail, ...rest] = delivered[0]!.context
  expect(rest).toEqual([])
  expect(detail!.startsWith(NOTICE)).toBe(true)
  expect(detail).toContain(`fake task ${SLOW_ID} is completed`)
  expect(detail).toContain('echo: hi')
  expect(sent[0]!.text).not.toContain('echo: hi')
  expect(sent[0]!.text + detail).not.toContain(TOKEN)
})

test('a result that echoes the token reaches Claude with the token replaced', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const { sent, delivered } = submits($, on)
  const leaky = JSON.parse(JSON.stringify(doneSlow).replace('echo: hi', 'echo: s3cret'))
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? leaky : f.v1_get_working) })
  await slowTasks($, clock)
  done = true
  await clock.advance(5000)
  expect(delivered[0]!.context.join('\n')).toContain('echo: [token]')
  expect(sent[0]!.text + delivered[0]!.context.join('\n')).not.toContain(TOKEN)
})

test('several tasks ending in one tick make one submit', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const { sent, delivered } = submits($, on)
  let n = 0
  let done = false
  const slow = () => JSON.parse(JSON.stringify(f.v1_send_slow).replaceAll(SLOW_ID, `t${++n}`))
  const asked = (b: { params: { id: string } }) => JSON.parse(JSON.stringify(done ? f.v1_get_completed : f.v1_get_working).replaceAll(SLOW_ID, b.params.id))
  fakeNet(on, { send: slow, get: asked })
  await slowTasks($, clock, 2)
  done = true
  await clock.advance(5000)
  expect(sent.length).toBe(1)
  expect(sent[0]!.text).toBe('a2a: 2 tasks finished (fake ✓, fake ✓)')
  expect(delivered[0]!.context.length).toBe(1)
  expect((delivered[0]!.context[0]!.match(/fake task /g) ?? []).length).toBe(2)
})

test('a task that asks a question tells Claude in the context how to answer it', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const { sent, delivered } = submits($, on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? askSlow : f.v1_get_working) })
  await slowTasks($, clock, 1, 'ask colour')
  done = true
  await clock.advance(5000)
  expect(sent[0]!.text).toBe(`a2a: fake task ${SLOW_ID.slice(0, 4)}… needs input`)
  const detail = delivered[0]!.context[0]!
  expect(detail).toContain('Which colour?')
  expect(detail).toContain(`call the send tool with worker "fake", taskId "${SLOW_ID}"`)
  expect(sent[0]!.text + detail).not.toContain(TOKEN)
})

for (const [name, mod] of [['above', above], ['below', below]] as const) {
  test(`a mod ${name} keeps its own context beside the wake detail`, { options: { tokens: 'fake=s3cret' }, plugins: [mod] }, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const { delivered } = submits($, on)
    let done = false
    fakeNet(on, { send: f.v1_send_slow, get: () => (done ? doneSlow : f.v1_get_working) })
    await slowTasks($, clock)
    done = true
    await clock.advance(5000)
    const context = delivered.at(-1)!.context
    expect(context.length).toBe(2)
    expect(context).toContain(`${name.toUpperCase()} CONTEXT`)
    expect(context.some(c => c.startsWith(NOTICE))).toBe(true)
  })
}

test('prompts that are not our own wake pass through without our context', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const seen: Seen[] = []
  on('prompt.submit', async (_$, e) => { seen.push({ text: e.text, context: e.context ?? [], origin: e.origin as never }); return { text: e.text } })
  await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
  await $.prompt.submit({ text: 'from another mod', origin: { kind: 'plugin', name: 'other' }, wait: false })
  await $.prompt.submit({ text: 'stray', origin: OWN, wait: false })
  expect(seen.map(s => s.context)).toEqual([[], [], []])
})

test('wakeLine names one task, or counts several, in a single line of at most 100 characters', () => {
  const one: WakeItem = { worker: 'fake', taskId: '3f9a1c22-0000', state: 'completed', body: 'x' }
  expect(wakeLine([one])).toBe('a2a: fake task 3f9a… completed')
  expect(wakeLine([{ ...one, taskId: undefined }])).toBe('a2a: fake task completed')
  expect(wakeLine([one, { ...one, worker: 'adk', state: 'input-required' }, { ...one, worker: 'big', state: 'failed' }])).toBe('a2a: 3 tasks finished (fake ✓, adk ?, big ✕)')
  const hostile = wakeLine([{ ...one, worker: `a\nb\x1b[31m${'w'.repeat(200)}` }])
  expect(hostile).not.toMatch(/[\n\x1b]/)
  expect([...hostile].length).toBe(100)
  expect([...wakeLine(Array.from({ length: 30 }, () => one))].length).toBeLessThanOrEqual(100)
})

test('wakeDetail starts with its provenance line and lists every result', () => {
  const items: WakeItem[] = [
    { worker: 'fake', taskId: 't1', state: 'completed', body: 'fake task t1 is completed.\n\nfirst' },
    { worker: 'adk', taskId: 't2', state: 'input-required', body: 'adk task t2 is input-required.\n\nWhich?' },
  ]
  const text = wakeDetail(items)
  expect(text.startsWith(NOTICE)).toBe(true)
  expect(text).toContain('first')
  expect(text).toContain('call the send tool with worker "adk", taskId "t2"')
  expect(text).not.toContain('worker "fake"')
})
