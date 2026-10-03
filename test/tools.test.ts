import { test, expect, mock } from 'claude-code/testing'
import { fakeNet, STORE, TOKEN_ENV } from './kit.ts'
import { fixtures as f } from './fixtures.ts'

test('workers lists aliases and skills without tokens', async ($, on) => {
  mock.store(on, STORE)
  const out = String((await $.tool.call({ tool: 'mcp__a2a-mod__workers' })).result)
  expect(out).toContain('fake')
  expect(out).toContain('echo')
  expect(out).not.toContain('s3cret')
})

test('send returns a quick answer inline', async ($, on) => {
  mock.store(on, STORE)
  mock.env(on, TOKEN_ENV)
  const clock = mock.clock(on)
  fakeNet(on, { send: f.v1_send_slow, get: f.v1_get_completed })
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })
  await clock.advance(7500)
  const out = String((await p).result)
  expect(out).toContain('completed')
  expect(out).toContain('echo: hi')
})

test('send sends the env token and never shows it', async ($, on) => {
  mock.store(on, STORE)
  mock.env(on, TOKEN_ENV)
  const net = fakeNet(on)
  const out = String((await $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })).result)
  expect(net.calls.at(-1)?.init?.headers?.Authorization).toBe('Bearer s3cret')
  expect(out).not.toContain('s3cret')
})

test('send to an unknown worker lists the known ones', async ($, on) => {
  mock.store(on, STORE)
  const ran = await $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'nope', message: 'hi' })
  expect(String(ran.result)).toContain('fake')
})

test('send cuts a long result and the task tool returns it whole', async ($, on) => {
  mock.store(on, STORE)
  mock.env(on, TOKEN_ENV)
  const long = JSON.parse(JSON.stringify(f.v1_get_completed).replace('echo: hi', `echo: ${'x'.repeat(20000)}`))
  fakeNet(on, { send: long.result && { jsonrpc: '2.0', id: 1, result: { task: long.result } }, get: long })
  const sent = String((await $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })).result)
  expect(sent).toContain('task tool')
  expect(sent.length).toBeLessThan(8500)
  const full = String((await $.tool.call({ tool: 'mcp__a2a-mod__task', worker: 'fake', taskId: 't1' })).result)
  expect(full).toContain('x'.repeat(20000))
  expect(full).not.toContain('truncated')
})

test('a worker that never answers ends the send with a sentence, inside the hook budget', async ($, on) => {
  mock.store(on, STORE)
  mock.env(on, TOKEN_ENV)
  const clock = mock.clock(on)
  on('http.fetch', () => new Promise(() => {}))
  const p = $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })
  await clock.advance(10000)
  const out = String((await p).result)
  expect(out).toContain('did not answer')
})

test('task cancel calls the cancel method', async ($, on) => {
  mock.store(on, STORE)
  mock.env(on, TOKEN_ENV)
  const net = fakeNet(on)
  await $.tool.call({ tool: 'mcp__a2a-mod__task', worker: 'fake', taskId: 't1', cancel: true })
  expect(JSON.parse(net.calls.at(-1)?.init?.body ?? '{}').method).toBe('CancelTask')
})
