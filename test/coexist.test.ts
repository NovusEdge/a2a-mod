import { test, expect, mock, type Engine, type MockClock, type Plugin } from 'claude-code/testing'
import type { RenderElement, RenderPropsOf } from 'claude-code'
import { BAND_PROPS, engineUi, fakeNet, PANE_PROPS, promptLog, STORE, SURFACES } from './kit.ts'
import { fixtures as f } from './fixtures.ts'

// Another mod that draws its own band, restyles every tool row, and adds prompt context.
// Inline plugins load beneath the plugin under test.
const other: Plugin = {
  name: 'other',
  register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if (e.props.hasSurvey) return next(e)
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, 'OTHER BAND') as RenderElement
    })
    on('ui.render', { component: 'ToolUse' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, `OTHER ROW ${e.props.tool}`) as RenderElement
    })
    on('prompt.submit', async (_$, e, next) => next({ ...e, context: [...(e.context ?? []), 'OTHER CONTEXT'] }))
  },
}

const WITH_OTHER = { options: { tokens: 'fake=s3cret' }, plugins: [other] }
const SLOW_ID = f.v1_send_slow.result.task.id
const ASK_ID = f.v1_send_ask.result.task.id
const resumed = JSON.parse(JSON.stringify(f.v1_send_slow).replaceAll(SLOW_ID, ASK_ID))
const resumedGet = JSON.parse(JSON.stringify(f.v1_get_working).replaceAll(SLOW_ID, ASK_ID))

const toolUse = (tool: string): RenderPropsOf['ToolUse'] =>
  ({ tool_use_id: `id-${tool}`, tool, input: { worker: 'fake', message: 'slow 60 build' }, isRunning: false, isErrored: false, isInterrupted: false })

async function send($: Engine, clock: MockClock, message: string, taskId?: string) {
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message, ...(taskId ? { taskId } : {}) })
  await clock.advance(7500)
  await p
}

for (const surface of SURFACES) {
  test(`with no a2a work the other mod's band shows alone on ${surface}`, WITH_OTHER, async ($, on) => {
    mock.store(on, STORE)
    engineUi(on)
    const ui = await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'AbovePrompt', props: BAND_PROPS() })
    expect(await ui.drawn()).toEqual({ type: 'Text', children: ['OTHER BAND'] })
  })

  test(`with a live task both bands show, ours on top, on ${surface}`, WITH_OTHER, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
    await send($, clock, 'slow 60 build')
    const ui = await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'AbovePrompt', props: BAND_PROPS() })
    expect(await ui.find({ type: 'Client', key: 'wire' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'OTHER BAND' })).toBeDefined()
  })

  test(`during a survey neither band draws on ${surface}`, WITH_OTHER, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
    await send($, clock, 'slow 60 build')
    const ui = await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'AbovePrompt', props: BAND_PROPS({ hasSurvey: true }) })
    expect(await ui.drawn()).toEqual({ type: 'Text', props: {}, children: ['engine AbovePrompt'] })
  })

  test(`a mod that restyles every tool row gets every row but ours on ${surface}`, WITH_OTHER, async ($, on) => {
    mock.store(on, STORE)
    engineUi(on)
    const bash = await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolUse', props: toolUse('Bash') })
    expect(await bash.find({ type: 'Text', text: 'OTHER ROW Bash' })).toBeDefined()
    const ours = await $.ui.mount({ plugin: 'a2a-mod', surface, component: 'ToolUse', props: toolUse('mcp__a2a-mod__send') })
    expect(await ours.find({ type: 'Text', text: '⇢ ' })).toBeDefined()
  })
}

test('in the pane layout the other mod gets our tool rows too', { ...WITH_OTHER, options: { tokens: 'fake=s3cret', layout: 'pane' } }, async ($, on) => {
  mock.store(on, STORE)
  engineUi(on)
  const ours = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'ToolUse', props: toolUse('mcp__a2a-mod__send') })
  expect(await ours.find({ type: 'Text', text: 'OTHER ROW mcp__a2a-mod__send' })).toBeDefined()
})

test("a pane reply's context line and the other mod's context both reach Claude", WITH_OTHER, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  engineUi(on)
  const prompts = promptLog(on)
  let replied = false
  fakeNet(on, { send: () => (replied ? resumed : f.v1_send_ask), get: () => (replied ? resumedGet : f.v1_get_input_required) })
  await send($, clock, 'ask colour')
  const ui = await $.ui.mount({ plugin: 'a2a-mod', surface: 'terminal', component: 'Pane', requestId: 'a2a-workers', props: PANE_PROPS() })
  await ui.press({ key: `open:${ASK_ID}` })
  await ui.press({ key: `reply:${ASK_ID}` })
  replied = true
  await ui.input({ key: `input:${ASK_ID}`, text: 'blue' })
  await $.prompt.submit({ text: 'carry on', origin: { kind: 'composer' }, wait: false })
  expect(prompts.at(-1)?.context).toEqual([`You answered fake's question on task ${ASK_ID}: "blue"`, 'OTHER CONTEXT'])
})
