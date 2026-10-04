import { test, expect, mock, type Engine, type MockClock, type Plugin } from 'claude-code/testing'
import type { RenderElement, RenderSurface } from 'claude-code'
import { BAND_PROPS, engineUi, expectNoToken, fakeNet, STORE, SURFACES, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'
import { BACK_MS, direction, nextRedraw } from '../hooks/ui/band.tsx'
import { SHOW_MS } from '../hooks/recent.ts'
import type { RecentTask } from '../types/index.d.ts'

const mountBand = <S extends RenderSurface>($: Engine, surface: S, over = {}) =>
  $.ui.mount({ plugin: 'a2a-mod', surface, component: 'AbovePrompt', props: BAND_PROPS(over) })

async function send($: Engine, clock: MockClock, message: string) {
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message })
  await clock.advance(7500)
  await p
}

const row = (over: Partial<RecentTask>): RecentTask => ({ worker: 'w', taskId: 't', text: '', state: 'working', startedAt: 0, changedAt: 0, ...over })

test('the packet goes out after a send, back after a result, and rests when nothing runs', () => {
  expect(direction([row({ startedAt: 5 }), row({ state: 'completed', startedAt: 1, endedAt: 3 })], 10)).toBe('out')
  expect(direction([row({ startedAt: 1 }), row({ state: 'completed', startedAt: 2, endedAt: 9 })], 10)).toBe('back')
  expect(direction([row({ state: 'completed', endedAt: 9 })], 9 + BACK_MS + 1)).toBe('idle')
})

test('a lone task that just ended still gets its return packet, for two seconds', () => {
  const done = [row({ state: 'completed', startedAt: 1, endedAt: 1000 })]
  expect(direction(done, 1500)).toBe('back')
  expect(direction(done, 1000 + BACK_MS)).toBe('idle')
})

test('the next redraw is when a finished row ages out or the return packet rests', () => {
  const done = row({ state: 'completed', endedAt: 1000 })
  expect(nextRedraw([done], 1500, true)).toBe(BACK_MS - 500)
  expect(nextRedraw([done], 1500, false)).toBe(SHOW_MS - 500)
  expect(nextRedraw([done], 1000 + BACK_MS, true)).toBe(SHOW_MS - BACK_MS)
  expect(nextRedraw([row({})], 0, true)).toBeUndefined()
})

// Reports a toast each time the band asks the hooks beneath it, which is once per band draw.
// A plugin's hooks cannot close over test variables, so engineUi's toast list is the counter.
const counter: Plugin = {
  name: 'counter',
  register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      $.ui.toast('band-draw')
      return h($.ui.resolve(e).Text, {}, 'COUNT') as RenderElement
    })
  },
}

for (const surface of SURFACES) {
  test(`with no recent work the band passes to the next hook on ${surface}`, async ($, on) => {
    mock.store(on, STORE)
    engineUi(on)
    const ui = await mountBand($, surface)
    expect(await ui.drawn()).toEqual({ type: 'Text', props: {}, children: ['engine AbovePrompt'] })
  })

  test(`a live task draws the wire and a chip, with the next hook's tree under them, on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
    await send($, clock, 'slow 60 build')
    const ui = await mountBand($, surface)
    expect(await ui.find({ type: 'Client', key: 'wire' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ fake · slow 60 build · \d+:\d\d$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'engine AbovePrompt' })).toBeDefined()
    const before = JSON.stringify(await ui.drawn({ in: 'wire' }))
    await ui.advance(400)
    expect(JSON.stringify(await ui.drawn({ in: 'wire' }))).not.toBe(before)
    await expectNoToken(ui)
  })

  test(`a waiting task's chip says it waits on Claude on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_ask, get: f.v1_get_input_required })
    await send($, clock, 'ask colour')
    const ui = await mountBand($, surface)
    expect(await ui.find({ type: 'Text', text: ' fake · waiting on Claude' })).toBeDefined()
  })

  test(`a lone finished task runs the packet back on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_echo, get: f.v1_get_completed })
    await send($, clock, 'hi')
    const ui = await mountBand($, surface)
    const wire = await ui.find({ type: 'Client', key: 'wire' })
    expect((wire?.props.props as { dir: string }).dir).toBe('back')
  })

  test(`a survey always gets the band on ${surface}`, WITH_TOKEN, async ($, on) => {
    mock.store(on, STORE)
    const clock = mock.clock(on)
    engineUi(on)
    fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_working })
    await send($, clock, 'slow 60 build')
    const ui = await mountBand($, surface, { hasSurvey: true })
    expect(await ui.drawn()).toEqual({ type: 'Text', props: {}, children: ['engine AbovePrompt'] })
  })
}

test('the band redraws when its return packet is due to rest', { ...WITH_TOKEN, plugins: [counter] }, async ($, on) => {
  mock.store(on, STORE)
  const clock = mock.clock(on)
  const seen = engineUi(on)
  fakeNet(on, { send: f.v1_send_echo, get: f.v1_get_completed })
  await send($, clock, 'hi')
  await mountBand($, 'terminal')
  const draws = () => seen.toasts.filter(t => t === 'band-draw').length
  const before = draws()
  await clock.advance(BACK_MS + 100)
  expect(draws()).toBeGreaterThan(before)
})
