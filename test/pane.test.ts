import { test, expect, mock, type Engine, type MockClock, type Plugin } from 'claude-code/testing'
import { RECENT_MAX, RESULT_MAX, SHOW_MS, TEXT_MAX } from '../hooks/recent.ts'
import type { RenderSurface } from 'claude-code'
import type { RecentTask } from '../types/index.d.ts'
import { boxWith, completedWith, drawnAll, engineUi, expectNoToken, fakeNet, has, PANE_PROPS, promptLog, runA2a, seedRecent, STORE, SURFACES, textUnder, widthOf, WITH_TOKEN, type Node } from './kit.ts'
import { fixtures as f } from './fixtures.ts'

const seeded = (taskId: string, over: Partial<RecentTask> = {}): RecentTask =>
  ({ worker: 'fake', taskId, text: `job ${taskId}`, state: 'working', startedAt: 0, changedAt: 0, ...over })

const SLOW_ID = f.v1_send_slow.result.task.id
const ASK_ID = f.v1_send_ask.result.task.id
const ECHO_ID = f.v1_send_echo.result.task.id
const DONE_ID = f.v1_get_completed.result.id
const resumed = JSON.parse(JSON.stringify(f.v1_send_slow).replaceAll(SLOW_ID, ASK_ID))
const resumedGet = JSON.parse(JSON.stringify(f.v1_get_working).replaceAll(SLOW_ID, ASK_ID))
const leaky = JSON.parse(JSON.stringify(f.v1_get_completed).replace('echo: hi', 'echo: s3cret'))
// Test-runner output a worker might return: colour codes, a bell, CRLF.
const ansi = completedWith('\u001b[32mPASS\u001b[0m 12 tests\u0007\r\n')

const mountPane = <S extends RenderSurface>($: Engine, surface: S, cols = 60) =>
  $.ui.mount({ plugin: 'a2a-mod', surface, component: 'Pane', requestId: 'a2a-workers', props: PANE_PROPS(cols) })

async function sendAndWait($: Engine, clock: MockClock, message: string, taskId?: string) {
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message, ...(taskId ? { taskId } : {}) })
  await clock.advance(7500)
  return String((await p).result)
}

const shows = async (ui: Parameters<typeof drawnAll>[0], text: string) => (await drawnAll(ui)).some(t => JSON.stringify(t).includes(text))

for (const surface of SURFACES) {
  test(`the empty pane says how to add a worker on ${surface}`, async ($, on) => {
    mock.store(on)
    engineUi(on)
    const ui = await mountPane($, surface)
    expect(await ui.find({ type: 'Text', text: 'No workers yet' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/a2a add <url>' })).toBeDefined()
  })

  test(`a running row animates; Cancel calls CancelTask, shows canceling…, and Claude hears canceled on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const woke = promptLog(on)
    let canceled = false
    const net = fakeNet(on, { send: f.v1_send_slow, get: () => (canceled ? f.v1_cancel : f.v1_get_working) })
    await sendAndWait($, clock, 'slow 60 build')
    const ui = await mountPane($, surface)
    const key = `row:${SLOW_ID}`
    expect(await ui.find({ type: 'Text', text: /1 live/ })).toBeDefined()
    expect(await ui.find({ type: 'Client', key })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: `reply:${SLOW_ID}` })).toBeUndefined()
    const before = JSON.stringify(await ui.drawn({ in: key }))
    await ui.advance(400)
    expect(JSON.stringify(await ui.drawn({ in: key }))).not.toBe(before)

    await ui.press({ key: `cancel:${SLOW_ID}` })
    expect(JSON.parse(net.calls.at(-1)?.init?.body ?? '{}').method).toBe('CancelTask')
    expect(await ui.find({ type: 'Text', text: /canceling…/, in: key })).toBeDefined()
    canceled = true
    await clock.advance(5000)
    expect(woke.at(-1)?.text).toContain('canceled')
    await expectNoToken(ui)
  })

  test(`Reply sends on the same task, shows who answered, and tells Claude with the next prompt on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const prompts = promptLog(on)
    let replied = false
    const net = fakeNet(on, { send: () => (replied ? resumed : f.v1_send_ask), get: () => (replied ? resumedGet : f.v1_get_input_required) })
    expect(await sendAndWait($, clock, 'ask colour')).toContain('input-required')
    const ui = await mountPane($, surface)
    expect(await ui.find({ type: 'Button', key: `cancel:${ASK_ID}` })).toBeDefined()

    await ui.press({ key: `reply:${ASK_ID}` })
    expect(await ui.find({ type: 'Input', key: `input:${ASK_ID}` })).toBeDefined()

    replied = true
    await ui.input({ key: `input:${ASK_ID}`, text: 'blue' })
    const body = JSON.parse(net.calls.at(-1)?.init?.body ?? '{}')
    expect(body.method).toBe('SendMessage')
    expect(body.params.message.taskId).toBe(ASK_ID)
    expect(body.params.message.parts[0].text).toBe('blue')
    expect(await ui.find({ type: 'Text', text: /answered by you/ })).toBeDefined()
    expect(await ui.find({ type: 'Input', key: `input:${ASK_ID}` })).toBeUndefined()

    await $.prompt.submit({ text: 'carry on', origin: { kind: 'composer' }, wait: false })
    expect(prompts.at(-1)?.context).toContain(`You answered fake's question on task ${ASK_ID}: "blue"`)
    await $.prompt.submit({ text: 'and again', origin: { kind: 'composer' }, wait: false })
    expect(prompts.at(-1)?.context).toEqual([])
    await expectNoToken(ui)
  })

  test(`a draft survives a redraw, and ✕ discards it on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_ask, get: f.v1_get_input_required })
    await sendAndWait($, clock, 'ask colour')
    const ui = await mountPane($, surface)
    await ui.press({ key: `reply:${ASK_ID}` })
    await ui.input({ key: `input:${ASK_ID}`, text: 'blu', kind: 'change' })
    await ui.press({ key: `open:${ASK_ID}` })
    expect((await ui.find({ type: 'Input', key: `input:${ASK_ID}` }))?.props.value).toBe('blu')
    await ui.press({ key: `discard:${ASK_ID}` })
    expect(await ui.find({ type: 'Input', key: `input:${ASK_ID}` })).toBeUndefined()
    await ui.press({ key: `reply:${ASK_ID}` })
    expect((await ui.find({ type: 'Input', key: `input:${ASK_ID}` }))?.props.value).toBe('')
  })

  test(`Open shows the result, Copy copies it, and the token never shows on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    const seen = engineUi(on)
    fakeNet(on, { send: f.v1_send_echo, get: leaky })
    await sendAndWait($, clock, 'hi')
    const ui = await mountPane($, surface)
    await ui.press({ key: `open:${ECHO_ID}` })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('echo: [token]')
    await ui.press({ key: `copy:${ECHO_ID}` })
    expect(seen.copies).toEqual(['echo: [token]'])
    await ui.press({ key: `open:${ECHO_ID}` })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await expectNoToken(ui)
  })

  test(`worker output with colour codes still draws, without them, on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_echo, get: ansi })
    await sendAndWait($, clock, '\u001b[1mbold\u001b[0m ask')
    const ui = await mountPane($, surface)
    await ui.press({ key: `open:${ECHO_ID}` })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('PASS 12 tests\n')
    expect(await shows(ui, 'bold ask')).toBe(true)
  })

  test(`Cancel hides while canceling, so a second press cannot send another CancelTask, on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const net = fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
    await sendAndWait($, clock, 'slow 60 build')
    const ui = await mountPane($, surface)
    await ui.press({ key: `cancel:${SLOW_ID}` })
    expect(await ui.find({ type: 'Button', key: `cancel:${SLOW_ID}` })).toBeUndefined()
    expect(net.calls.filter(c => JSON.parse(c.init?.body ?? '{}').method === 'CancelTask').length).toBe(1)
  })

  test(`an empty reply sends nothing and keeps the field on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    const net = fakeNet(on, { send: f.v1_send_ask, get: f.v1_get_input_required })
    await sendAndWait($, clock, 'ask colour')
    const ui = await mountPane($, surface)
    await ui.press({ key: `reply:${ASK_ID}` })
    const before = net.calls.length
    await ui.input({ key: `input:${ASK_ID}`, text: '   ' })
    expect(net.calls.length).toBe(before)
    expect(await ui.find({ type: 'Input', key: `input:${ASK_ID}` })).toBeDefined()
  })

  test(`a theme that cannot be read falls back and the pane still draws on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    engineUi(on, { theme: new Error('config.list refused') })
    const ui = await mountPane($, surface)
    expect(await ui.find({ type: 'Text', text: 'A2A 1.0' })).toBeDefined()
  })

  test(`a copy that fails says why on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    const seen = engineUi(on, { copied: false })
    fakeNet(on, { send: f.v1_send_echo, get: f.v1_get_completed })
    await sendAndWait($, clock, 'hi')
    const ui = await mountPane($, surface)
    await ui.press({ key: `open:${ECHO_ID}` })
    await ui.press({ key: `copy:${ECHO_ID}` })
    expect(seen.toasts.at(-1)).toContain('nothing was copied')
  })

  test(`a removed worker's row shows removed on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_ask, get: f.v1_get_input_required })
    await sendAndWait($, clock, 'ask colour')
    await runA2a($, 'remove fake')
    const ui = await mountPane($, surface)
    expect(await shows(ui, 'worker removed')).toBe(true)
    expect(await ui.find({ type: 'Text', text: 'removed' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: `cancel:${ASK_ID}` })).toBeUndefined()
  })

  test(`at 36 columns the labels shrink and nothing is wider than the pane on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    let n = 0
    fakeNet(on, { send: () => (n++ ? f.v1_send_slow : f.v1_send_ask), get: (b: { params: { id: string } }) => (b.params.id === ASK_ID ? f.v1_get_input_required : f.v1_get_working) })
    await sendAndWait($, clock, 'ask colour')
    await sendAndWait($, clock, `slow 60 ${'a very long task description '.repeat(4)}`)
    const ui = await mountPane($, surface, 36)
    expect((await ui.find({ type: 'Button', key: `cancel:${SLOW_ID}` }))?.props.label).toBe('✕')
    expect((await ui.find({ type: 'Button', key: `reply:${ASK_ID}` }))?.props.label).toBe('↩')
    expect(await ui.find({ type: 'Text', text: /^echo$/ })).toBeUndefined()
    for (const tree of await drawnAll(ui)) expect(widthOf(tree)).toBeLessThanOrEqual(36)
  })

  test(`twenty running rows draw without a refusal on ${surface}`, { ...WITH_TOKEN, timeoutMs: 15_000 }, async ($, on) => {
    mock.store(on, STORE)
    mock.clock(on)
    engineUi(on)
    seedRecent(on, Array.from({ length: 20 }, (_, i) => seeded(`t${i}`, { text: `slow 60 job ${i}` })))
    const ui = await mountPane($, surface)
    expect((await ui.findAll({ type: 'Client' })).length).toBe(20)
    await ui.advance(400)
    expect((await drawnAll(ui)).length).toBe(21)
  })

  test(`a full list of rows with 5,000-character messages and a 10,000-character result open stay under the tree limit, and one row opens at a time, on ${surface}`, { ...WITH_TOKEN, timeoutMs: 15_000 }, async ($, on) => {
    mock.store(on, STORE)
    mock.clock(on)
    engineUi(on)
    // The send path cuts a message to TEXT_MAX, so the seeded rows carry the longest text it can store.
    seedRecent(on, Array.from({ length: RECENT_MAX }, (_, i) => seeded(`e${i}`, { text: 'm'.repeat(TEXT_MAX), state: 'completed', endedAt: 0, result: 'r'.repeat(RESULT_MAX) })))
    const ui = await mountPane($, surface)
    await ui.press({ key: 'open:e0' })
    expect((await ui.findAll({ type: 'Markdown' })).length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /^engine Pane$/ })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn()).length).toBeLessThan(100_000)
    await ui.press({ key: 'open:e1' })
    expect((await ui.findAll({ type: 'Markdown' })).length).toBe(1)
    expect(await ui.find({ type: 'Button', key: 'copy:e1' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'copy:e0' })).toBeUndefined()
  })
}

// A pane draw reads the theme once, so a toast per config.list read counts the draws.
// A plugin's hooks cannot close over test variables, so engineUi's toast list is the counter.
const themeReads: Plugin = {
  name: 'theme-reads',
  register(on) {
    on('config.list', async ($, e, next) => {
      $.ui.toast('pane-draw')
      return next(e)
    })
  },
}

test('the pane redraws when a finished row is due to age out', { ...WITH_TOKEN, plugins: [themeReads] }, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const seen = engineUi(on)
  fakeNet(on, { send: f.v1_send_echo, get: f.v1_get_completed })
  await sendAndWait($, clock, 'hi')
  await mountPane($, 'terminal')
  const draws = () => seen.toasts.filter(t => t === 'pane-draw').length
  const before = draws()
  await clock.advance(SHOW_MS + 1000)
  expect(draws()).toBeGreaterThan(before)
})

test('vscode draws still rows and keeps Reply; mobile drops Reply and every Input', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  let n = 0
  fakeNet(on, { send: () => (n++ ? f.v1_send_slow : f.v1_send_ask), get: (b: { params: { id: string } }) => (b.params.id === ASK_ID ? f.v1_get_input_required : f.v1_get_working) })
  await sendAndWait($, clock, 'ask colour')
  await sendAndWait($, clock, 'slow 60 build')

  const vs = await mountPane($, 'vscode')
  expect(has(await vs.drawn(), 'Client')).toBe(false)
  await vs.press({ key: `reply:${ASK_ID}` })
  expect(await vs.find({ type: 'Input', key: `input:${ASK_ID}` })).toBeDefined()
  await vs.press({ key: `discard:${ASK_ID}` })

  const mobile = await mountPane($, 'mobile')
  const tree = await mobile.drawn()
  expect(has(tree, 'Client')).toBe(false)
  expect(has(tree, 'Input')).toBe(false)
  expect(await mobile.find({ type: 'Button', key: `reply:${ASK_ID}` })).toBeUndefined()
  expect(await mobile.find({ type: 'Button', key: `open:${ASK_ID}` })).toBeDefined()
  expect(await mobile.find({ type: 'Button', key: `cancel:${ASK_ID}` })).toBeDefined()
})

test('/a2a opens the pane slim and without taking focus', async ($, on) => {
  mock.store(on, STORE)
  const seen = engineUi(on)
  expect((await runA2a($)).text).toContain('/a2a add <url>')
  expect(seen.opened).toEqual(['a2a-workers'])
  expect(seen.args[0]).toMatchObject({ columns: 32, rows: 12 })
  expect(seen.args[0]).not.toHaveProperty('focus')
})

test('tracking a task never opens the pane', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const seen = engineUi(on)
  fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
  await sendAndWait($, clock, 'slow 60 build')
  await clock.advance(10_000)
  expect(seen.opened).toEqual([])
})

const TWO = { workers: { ...STORE.workers, slow: { ...STORE.workers.fake, alias: 'slow', name: 'Slow Worker', addedAt: 1 } } }

// A waiting task and a running one under two workers, so the pane has every kind of line.
async function busyPane($: Engine, on: Parameters<typeof mock.store>[0], cols: number) {
  mock.store(on, TWO)
  // A running row's client counts elapsed time from the real clock.
  const clock = mock.clock(on, { now: Date.now() })
  engineUi(on)
  let n = 0
  fakeNet(on, { send: () => (n++ ? f.v1_send_slow : f.v1_send_ask), get: (b: { params: { id: string } }) => (b.params.id === ASK_ID ? f.v1_get_input_required : f.v1_get_working) })
  await sendAndWait($, clock, 'ask colour')
  await sendAndWait($, clock, 'slow 60 build')
  return mountPane($, 'terminal', cols)
}

for (const cols of [32, 24]) {
  const inner = cols - 2
  const content = cols - 6

  test(`the pane at ${cols} columns never draws a line wider than the body`, WITH_TOKEN, async ($, on) => {
    const ui = await busyPane($, on, cols)
    for (const tree of await drawnAll(ui)) expect(widthOf(tree)).toBeLessThanOrEqual(cols)
    await ui.press({ key: `reply:${ASK_ID}` })
    await ui.press({ key: `open:${ASK_ID}` })
    for (const tree of await drawnAll(ui)) expect(widthOf(tree)).toBeLessThanOrEqual(cols)
  })

  test(`the header, rule, worker head and task row fill the width at ${cols} columns`, WITH_TOKEN, async ($, on) => {
    const ui = await busyPane($, on, cols)
    const tree = await ui.drawn()
    expect(widthOf(boxWith(tree, 'a2a'))).toBe(inner)
    expect(await ui.find({ type: 'Text', text: '─'.repeat(inner) })).toBeDefined()
    expect(widthOf(boxWith(tree, 'A2A 1.0'))).toBe(content)
    const rows = await drawnAll(ui)
    const row = rows.find(t => textUnder(t).includes('slow 60'))
    expect(widthOf(boxWith(row, 'slow 60'))).toBe(content)
  })

  test(`each worker sits in a rounded, dim-bordered box at ${cols} columns`, WITH_TOKEN, async ($, on) => {
    const ui = await busyPane($, on, cols)
    const boxes = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle === 'round')
    expect(boxes.length).toBe(2)
    for (const b of boxes) expect(b.props).toMatchObject({ borderColor: 'inactive', paddingX: 1 })
  })
}

test('the header counts workers and live tasks, in a shorter form when the width is short', WITH_TOKEN, async ($, on) => {
  const wide = await busyPane($, on, 32)
  expect(await wide.find({ type: 'Text', text: '2 workers · 2 live' })).toBeDefined()
  await wide.unmount()
  const slim = await mountPane($, 'terminal', 24)
  expect(await slim.find({ type: 'Text', text: '2w · 2 live' })).toBeDefined()
  await slim.unmount()
  const tiny = await mountPane($, 'terminal', 14)
  expect(await tiny.find({ type: 'Text', text: '2 live' })).toBeDefined()
})

test('the header counts one worker with nothing live', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const ui = await mountPane($, 'terminal', 32)
  expect(await ui.find({ type: 'Text', text: '1 worker' })).toBeDefined()
})

test('the footer has the add hint and, from 28 columns, the key hints after a rule', WITH_TOKEN, async ($, on) => {
  const dock = await busyPane($, on, 32)
  expect(await dock.find({ type: 'Text', text: '/a2a add <url>' })).toBeDefined()
  expect(await dock.find({ type: 'Text', text: 'tab move · enter · esc' })).toBeDefined()
  expect((await dock.findAll({ type: 'Text', text: '─'.repeat(30) })).length).toBe(2)
  await dock.unmount()
  const wide = await mountPane($, 'terminal', 40)
  expect(await wide.find({ type: 'Text', text: 'tab move · enter press · esc back' })).toBeDefined()
  await wide.unmount()
  const edge = await mountPane($, 'terminal', 28)
  expect(await edge.find({ type: 'Text', text: 'tab move · enter · esc' })).toBeDefined()
  await edge.unmount()
  const slim = await mountPane($, 'terminal', 27)
  expect(await slim.find({ type: 'Text', text: '/a2a add <url>' })).toBeDefined()
  expect(await slim.find({ type: 'Text', text: /tab move/ })).toBeUndefined()
})

test('the body grows to the pane height, so the footer sits at the bottom', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const ui = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'Pane', requestId: 'a2a-workers', props: PANE_PROPS(32, 30) })
  const root = (await ui.drawn()) as Node
  expect(root.props).toMatchObject({ minHeight: 30, paddingX: 1, paddingTop: 1 })
  expect((root.children ?? []).some(c => (c as Node).type === 'Box' && (c as Node).props?.flexGrow === 1)).toBe(true)
})

test('the empty pane is cut to the width at 10 columns', async ($, on) => {
  mock.store(on)
  engineUi(on)
  const empty = await mountPane($, 'terminal', 10)
  for (const tree of await drawnAll(empty)) expect(widthOf(tree)).toBeLessThanOrEqual(10)
})

test('the header is cut to the width at 10 and 4 columns', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const busy = await mountPane($, 'terminal', 10)
  const header = boxWith(await busy.drawn(), '⇄')
  expect(widthOf(header)).toBeLessThanOrEqual(8)
  await busy.unmount()
  const tiny = await mountPane($, 'terminal', 4)
  expect(widthOf(boxWith(await tiny.drawn(), '⇄'))).toBeLessThanOrEqual(2)
})

test('the empty pane is centred and says how to add a worker', async ($, on) => {
  mock.store(on)
  engineUi(on)
  const ui = await mountPane($, 'terminal', 32)
  expect(await ui.find({ type: 'Text', text: 'Claude ┄┄ ·' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'No workers yet' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '/a2a add <url>' })).toBeDefined()
  const root = (await ui.drawn()) as Node
  expect(root.props).toMatchObject({ alignItems: 'center', justifyContent: 'center' })
  expect(widthOf(root)).toBeLessThanOrEqual(32)
})
