import { test, expect, mock } from 'claude-code/testing'
import { fakeNet, runA2a, TOKEN_ENV } from './kit.ts'
import { fixtures as f } from './fixtures.ts'

test('/a2a add stores the worker by env var name and prints its skills', async ($, on) => {
  mock.store(on)
  mock.env(on, TOKEN_ENV)
  fakeNet(on)
  const out = await runA2a($, 'add http://worker.test fake --token-env A2A_TOKEN_1')
  expect(out.text).toContain('fake')
  expect(out.text).toContain('echo')
  expect(out.text).toContain('A2A_TOKEN_1')
  expect(out.text).not.toContain('s3cret')
  expect((await runA2a($, 'list')).text).toContain('Fake Worker')
})

test('/a2a add warns when the token variable is unset', async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  fakeNet(on)
  expect((await runA2a($, 'add http://worker.test fake --token-env A2A_TOKEN_2')).text).toContain('A2A_TOKEN_2 is not set')
})

test('/a2a add refuses a token variable outside the fixed set and stores nothing', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/me' })
  const net = fakeNet(on)
  expect((await runA2a($, 'add http://worker.test fake --token-env HOME')).text).toContain('A2A_TOKEN_1')
  expect(net.calls.length).toBe(0)
  expect((await runA2a($, 'list')).text).toContain('No workers')
})

test('every token variable the registry allows is read', async ($, on) => {
  mock.store(on)
  const vars = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`A2A_TOKEN_${i + 1}`, `tok${i + 1}`]))
  mock.env(on, vars)
  const net = fakeNet(on)
  for (let i = 1; i <= 9; i++) {
    await runA2a($, `add http://worker.test w${i} --token-env A2A_TOKEN_${i}`)
    await $.tool.call({ tool: 'mcp__a2a-mod__task', worker: `w${i}`, taskId: 't' })
    expect(net.calls.at(-1)?.init?.headers?.Authorization).toBe(`Bearer tok${i}`)
  }
})

test('a cross-origin endpoint gets the token only while trusted, and re-adding re-checks it', async ($, on) => {
  mock.store(on)
  mock.env(on, TOKEN_ENV)
  const card = JSON.parse(JSON.stringify(f.card_v1).replaceAll('http://worker.test/a2a/jsonrpc', 'http://api.elsewhere.test/rpc'))
  const net = fakeNet(on, { card })
  const send = () => $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })

  expect((await runA2a($, 'add http://worker.test fake --token-env A2A_TOKEN_1')).text).toContain('--trust-endpoint')
  const before = net.calls.length
  expect(String((await send()).result)).toContain('origin')
  expect(net.calls.length).toBe(before)

  await runA2a($, 'add http://worker.test fake --token-env A2A_TOKEN_1 --trust-endpoint')
  await send()
  expect(net.calls.at(-1)?.url).toBe('http://api.elsewhere.test/rpc')
  expect(net.calls.at(-1)?.init?.headers?.Authorization).toBe('Bearer s3cret')

  await runA2a($, 'add http://worker.test fake --token-env A2A_TOKEN_1')
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
