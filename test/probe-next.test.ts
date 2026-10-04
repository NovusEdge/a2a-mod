import { test, expect, type Plugin } from 'claude-code/testing'
import type { RenderElement, RenderPropsOf } from 'claude-code'

// Settles the UI spec's open item: can a render hook stack next(e)'s tree under its own in
// AbovePrompt? A prepend-tier plugin is outer to a user-tier one, so `outer` sees `inner`'s tree.
const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {},
}

const outer: Plugin = {
  name: 'outer',
  tier: 'prepend',
  register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const theirs = await next(e)
      const { Box, Text } = $.ui.resolve(e)
      return h(Box, { flexDirection: 'column' }, h(Text, {}, 'OUTER'), theirs) as RenderElement
    })
  },
}

const inner: Plugin = {
  name: 'inner',
  register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, 'INNER') as RenderElement
    })
  },
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a band hook can stack next(e)'s tree under its own on ${surface}`, { plugins: [outer, inner] }, async $ => {
    const ui = await $.ui.mount({ plugin: 'outer', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: 'OUTER' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'INNER' })).toBeDefined()
  })
}
