import { test, expect, mock } from 'claude-code/testing'
import { fakeNet, runA2a, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'

test('/a2a add stores the worker and prints its skills and token source', WITH_TOKEN, async ($, on) => {
  mock.store(on)
  fakeNet(on)
  const out = await runA2a($, 'add http://worker.test fake')
  expect(out.text).toContain('fake')
  expect(out.text).toContain('echo')
  expect(out.text).toContain('token from the tokens setting')
  expect(out.text).not.toContain('s3cret')
  expect((await runA2a($, 'list')).text).toContain('Fake Worker')
})

test('a cross-origin endpoint gets the token only while trusted, and re-adding re-checks it', WITH_TOKEN, async ($, on) => {
  mock.store(on)
  const card = JSON.parse(JSON.stringify(f.card_v1).replaceAll('http://worker.test/a2a/jsonrpc', 'http://api.elsewhere.test/rpc'))
  const net = fakeNet(on, { card })
  const send = () => $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })

  expect((await runA2a($, 'add http://worker.test fake')).text).toContain('--trust-endpoint')
  const before = net.calls.length
  expect(String((await send()).result)).toContain('origin')
  expect(net.calls.length).toBe(before)

  await runA2a($, 'add http://worker.test fake --trust-endpoint')
  await send()
  expect(net.calls.at(-1)?.url).toBe('http://api.elsewhere.test/rpc')
  expect(net.calls.at(-1)?.init?.headers?.Authorization).toBe('Bearer s3cret')

  await runA2a($, 'add http://worker.test fake')
  const again = net.calls.length
  expect(String((await send()).result)).toContain('origin')
  expect(net.calls.length).toBe(again)
})

test('/a2a add with no alias slugs the card name', async ($, on) => {
  mock.store(on)
  fakeNet(on)
  expect((await runA2a($, 'add http://worker.test')).text).toContain('fake-worker')
})

test('/a2a remove forgets a worker', async ($, on) => {
  mock.store(on)
  fakeNet(on)
  await runA2a($, 'add http://worker.test fake')
  expect((await runA2a($, 'remove fake')).text).toContain('Removed')
  expect((await runA2a($, 'list')).text).toContain('No workers')
})

test('/a2a with no args prints usage', async $ => {
  expect((await runA2a($)).text).toContain('/a2a add <url>')
})
