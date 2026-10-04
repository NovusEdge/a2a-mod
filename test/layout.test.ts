import { test, expect, mock, type Plugin } from 'claude-code/testing'
import { BAND_PROPS, CALL_IDS, completedWith, drawnAll, engineUi, expectNoToken, fakeNet, has, PANE_PROPS, promptLog, runA2a, STORE } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import type { Layout } from '../hooks/ui/settings.ts'

const SEND = 'mcp__a2a-mod__send'
const SLOW_ID = f.v1_send_slow.result.task.id
const doneSlow = JSON.parse(JSON.stringify(f.v1_get_completed).replaceAll(f.v1_get_completed.result.id, SLOW_ID))

const DRAWS: Record<Layout, { cards: boolean; band: boolean; pane: boolean }> = {
  full: { cards: true, band: true, pane: true },
  pane: { cards: false, band: false, pane: true },
  minimal: { cards: false, band: false, pane: false },
}

for (const layout of ['full', 'pane', 'minimal'] as const) {
  const want = DRAWS[layout]
  const plugins: Plugin[] = [CALL_IDS]
  test(`layout ${layout}: each piece draws or falls through to the engine`, { options: { tokens: 'fake=s3cret', layout }, plugins }, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    const seen = engineUi(on)
    const woke = promptLog(on)
    const statuses: (string | undefined)[] = []
    on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } })
    let done = false
    fakeNet(on, { send: f.v1_send_slow, get: () => (done ? doneSlow : f.v1_get_working) })

    const p = $.tool.call({ tool: SEND, worker: 'fake', message: 'slow 60 build' })
    await clock.advance(7500)
    const result = (await p).result
    const id = seen.callIds.at(-1)!
    expect(statuses.at(-1)).toBe('a2a: 1 running')
    expect(seen.opened.includes('a2a-workers')).toBe(want.pane)

    const engine = (component: string) => ({ type: 'Text', text: `engine ${component}` })
    const use = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: id, tool: SEND, input: { worker: 'fake', message: 'slow 60 build' }, isRunning: false, isErrored: false, isInterrupted: false } })
    expect(!!(await use.find(engine('ToolUse')))).toBe(!want.cards)
    const res = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'ToolResult', props: { tool_use_id: id, tool: SEND, output: result, isErrored: false } })
    expect(!!(await res.find(engine('ToolResult')))).toBe(!want.cards)
    const band = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS() })
    expect(!!(await band.find({ type: 'Client', key: 'wire' }))).toBe(want.band)

    done = true
    await clock.advance(5000)
    const wake = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'UserMessage', props: { text: woke.at(-1)!.text, origin: { kind: 'plugin', name: 'a2a-mod' }, isExpanded: false } })
    expect(!!(await wake.find(engine('UserMessage')))).toBe(!want.cards)

    seen.opened.length = 0
    await runA2a($)
    expect(seen.opened).toEqual(want.pane ? ['a2a-workers'] : [])
  })
}

test('a pane left open from another layout is closed when the session starts in minimal', { options: { tokens: 'fake=s3cret', layout: 'minimal' } }, async ($, on) => {
  mock.store(on, STORE)
  const seen = engineUi(on)
  on('tool.register', async (_$, e) => ({ value: { tool: e.name } }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  expect(seen.closed).toEqual(['a2a-workers'])
})

test('a session starting in the full layout leaves the pane alone', { options: { tokens: 'fake=s3cret' } }, async ($, on) => {
  mock.store(on, STORE)
  const seen = engineUi(on)
  on('tool.register', async (_$, e) => ({ value: { tool: e.name } }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  expect(seen.closed).toEqual([])
})

test('with animations off every client frame stays still and nothing types itself in', { options: { tokens: 'fake=s3cret', animations: false }, plugins: [CALL_IDS] }, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const woke = promptLog(on)
  let done = false
  fakeNet(on, { send: f.v1_send_slow, get: () => (done ? doneSlow : f.v1_get_working) })
  const p = $.tool.call({ tool: SEND, worker: 'fake', message: 'slow 60 build' })
  await clock.advance(7500)
  await p
  const mounts = [
    await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'Pane', requestId: 'a2a-workers', props: PANE_PROPS() }),
    await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'toolu_x', tool: SEND, input: { worker: 'fake', message: 'slow 60 build' }, isRunning: true, isErrored: false, isInterrupted: false } }),
    await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS() }),
  ]
  for (const ui of mounts) {
    const before = JSON.stringify(await drawnAll(ui))
    await ui.advance(400)
    expect(JSON.stringify(await drawnAll(ui))).toBe(before)
  }
  done = true
  await clock.advance(5000)
  const wake = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'UserMessage', props: { text: woke.at(-1)!.text, origin: { kind: 'plugin', name: 'a2a-mod' }, isExpanded: false } })
  expect(has(await wake.drawn(), 'Client')).toBe(false)
  expect(await wake.find({ type: 'Text', text: 'echo: hi' })).toBeDefined()
})

test('no drawn tree on any surface shows the token, wherever the worker echoed it', { options: { tokens: 'fake=s3cret' }, plugins: [CALL_IDS] }, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const seen = engineUi(on)
  const woke = promptLog(on)
  const ASK_ID = f.v1_send_ask.result.task.id
  const report = completedWith('report for s3cret')
  const done = { ...report, result: { ...report.result, id: SLOW_ID } }
  const asks = JSON.parse(JSON.stringify(f.v1_get_input_required).replace('Which colour?', 'Which colour, s3cret?'))
  let finished = false
  let n = 0
  fakeNet(on, {
    send: () => (n++ ? f.v1_send_ask : f.v1_send_slow),
    get: (b: { params: { id: string } }) => (b.params.id === ASK_ID ? asks : finished ? done : f.v1_get_working),
  })
  const slow = $.tool.call({ tool: SEND, worker: 'fake', message: 'slow 60 build' })
  await clock.advance(7500)
  const slowResult = (await slow).result
  const ask = $.tool.call({ tool: SEND, worker: 'fake', message: 'ask colour' })
  await clock.advance(7500)
  const askResult = (await ask).result
  finished = true
  await clock.advance(5000)
  const [slowId, askId] = seen.callIds
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const pane = await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'Pane', requestId: 'a2a-workers', props: PANE_PROPS() })
    await pane.press({ key: `open:${SLOW_ID}` })
    await pane.press({ key: `open:${ASK_ID}` })
    const mounts = [
      pane,
      await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolUse', props: { tool_use_id: slowId!, tool: SEND, input: { worker: 'fake', message: 'slow 60 build' }, isRunning: false, isErrored: false, isInterrupted: false } }),
      await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolResult', props: { tool_use_id: slowId!, tool: SEND, output: slowResult, isErrored: false } }),
      await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolResult', props: { tool_use_id: askId!, tool: SEND, output: askResult, isErrored: false } }),
      await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'AbovePrompt', props: BAND_PROPS() }),
      await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'UserMessage', props: { text: woke.at(-1)!.text, origin: { kind: 'plugin', name: 'a2a-mod' }, isExpanded: false } }),
    ]
    for (const ui of mounts) {
      await expectNoToken(ui)
      await ui.unmount()
    }
  }
  expect(woke.at(-1)!.text).toContain('[token]')
})
