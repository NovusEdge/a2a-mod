import { test, expect, mock, type Engine, type MockClock } from 'claude-code/testing'
import type { RenderPropsOf, RenderSurface } from 'claude-code'
import { CALL_IDS, completedWith, engineUi, expectNoToken, fakeNet, STORE, SURFACES, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import { textOf } from '../hooks/ui/cards.tsx'

const SEND = 'mcp__a2a-mod__send'
const ACME = { workers: { fake: { ...STORE.workers.fake, organization: 'Acme' } } }
// A card built from a stored worker that did not pass through parseCard.
const ANSI_ACME = { workers: { fake: { ...STORE.workers.fake, organization: '\u001b[31mAcme\u001b[0m' } } }
// CALL_IDS reports each send's tool_use_id, which the ToolResult row is keyed by.
const SENDS = { ...WITH_TOKEN, plugins: [CALL_IDS] }
const leaky = JSON.parse(JSON.stringify(f.v1_get_completed).replace('echo: hi', 'echo: s3cret'))

const useProps = (over: Partial<RenderPropsOf['ToolUse']> = {}): RenderPropsOf['ToolUse'] =>
  ({ tool_use_id: 'toolu_1', tool: SEND, input: { worker: 'fake', message: 'slow 60 build the docs' }, isRunning: true, isErrored: false, isInterrupted: false, ...over })

const mountUse = <S extends RenderSurface>($: Engine, surface: S, props = useProps()) =>
  $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolUse', requestId: props.tool_use_id, props })

async function sendFor($: Engine, clock: MockClock, ids: string[], message = 'hi') {
  const p = $.tool.call({ tool: SEND, worker: 'fake', message })
  await clock.advance(7500)
  const result = (await p).result
  return { id: ids.at(-1)!, result }
}

const mountResult = <S extends RenderSurface>($: Engine, surface: S, id: string, output: unknown, isErrored = false) =>
  $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolResult', requestId: id, props: { tool_use_id: id, tool: SEND, output, isErrored } })

test('textOf reads a string, a content list or a result object', () => {
  expect(textOf('a')).toBe('a')
  expect(textOf([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
  expect(textOf({ result: 'r' })).toBe('r')
  expect(textOf({ content: [{ type: 'text', text: 'c' }] })).toBe('c')
})

for (const surface of SURFACES) {
  test(`a running send draws the worker, its version and organization, the message and a live row on ${surface}`, async ($, on) => {
    mock.store(on, ACME)
    engineUi(on)
    const ui = await mountUse($, surface)
    expect(await ui.find({ type: 'Text', text: '⇢ ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' · A2A 1.0 · Acme' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '"slow 60 build the docs"' })).toBeDefined()
    const before = JSON.stringify(await ui.drawn({ in: 'run' }))
    await ui.advance(400)
    expect(JSON.stringify(await ui.drawn({ in: 'run' }))).not.toBe(before)
    await ui.redraw(useProps({ isRunning: false }))
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
  })

  test(`a completed result shows its badge and types itself in once on ${surface}`, SENDS, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    const seen = engineUi(on)
    fakeNet(on, { send: f.v1_send_echo, get: leaky })
    const { id, result } = await sendFor($, clock, seen.callIds)
    const ui = await mountResult($, surface, id, result)
    expect(await ui.find({ type: 'Text', text: 'completed' })).toBeDefined()
    expect(await ui.find({ type: 'Client', key: 'type' })).toBeDefined()
    await ui.advance(1600)
    expect(await ui.find({ type: 'Client', key: 'type' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /echo: \[token\]/ })).toBeDefined()
    await expectNoToken(ui)
    await ui.unmount()
    const again = await mountResult($, surface, id, result)
    expect(await again.find({ type: 'Client' })).toBeUndefined()
  })

  test(`a slow send's result says it is tracked in background on ${surface}`, SENDS, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    const seen = engineUi(on)
    fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
    const { id, result } = await sendFor($, clock, seen.callIds, 'slow 60 build')
    const ui = await mountResult($, surface, id, result)
    expect(await ui.find({ type: 'Text', text: 'tracked in background' })).toBeDefined()
  })

  test(`a question shows needs input, and a failure shows failed, on ${surface}`, SENDS, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    const seen = engineUi(on)
    const net = fakeNet(on, { send: f.v1_send_ask, get: f.v1_get_input_required })
    const asked = await sendFor($, clock, seen.callIds, 'ask colour')
    expect(await (await mountResult($, surface, asked.id, asked.result)).find({ type: 'Text', text: 'needs input' })).toBeDefined()
    net.state.down = true
    const failed = await sendFor($, clock, seen.callIds)
    expect(await (await mountResult($, surface, failed.id, failed.result)).find({ type: 'Text', text: 'failed' })).toBeDefined()
  })

  test(`a result and an organization with colour codes draw without them on ${surface}`, { ...SENDS, options: { tokens: 'fake=s3cret', animations: false } }, async ($, on) => {
    mock.store(on, ANSI_ACME)
    const clock = mock.clock(on)
    const seen = engineUi(on)
    fakeNet(on, { send: f.v1_send_echo, get: completedWith('\u001b[31mFAIL\u001b[0m 1 test') })
    const { id, result } = await sendFor($, clock, seen.callIds)
    const ui = await mountResult($, surface, id, result)
    expect(await ui.find({ type: 'Text', text: /FAIL 1 test/ })).toBeDefined()
    const use = await mountUse($, surface)
    expect(await use.find({ type: 'Text', text: ' · A2A 1.0 · Acme' })).toBeDefined()
  })

  test(`other tools' rows reach the engine untouched on ${surface}`, async ($, on) => {
    mock.store(on, STORE)
    engineUi(on)
    const ui = await mountUse($, surface, useProps({ tool: 'Bash', input: { command: 'ls' } }))
    expect(await ui.find({ type: 'Text', text: 'engine ToolUse' })).toBeDefined()
  })
}
