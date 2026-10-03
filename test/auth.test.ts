import { test, expect, mock } from 'claude-code/testing'
import { fakeNet, ran, runA2a, STORE, WITH_TOKEN } from './kit.ts'
import { fixtures as f } from './fixtures.ts'

const bearer = (net: ReturnType<typeof fakeNet>) => net.calls.at(-1)?.init?.headers?.Authorization
const taskCall = ($: any) => $.tool.call({ tool: 'mcp__a2a-mod__task', worker: 'fake', taskId: 't1' })
const echoing = (token: string) => JSON.parse(JSON.stringify(f.v1_get_completed).replace('echo: hi', `echo: ${token}`))

test('setting: a worker finds its token in the tokens setting by alias', WITH_TOKEN, async ($, on) => {
  mock.store(on, STORE)
  const net = fakeNet(on)
  await taskCall($)
  expect(bearer(net)).toBe('Bearer s3cret')
})

test('setting: a worker missing from the map sends no token', { options: { tokens: JSON.stringify({ other: 'x' }) } }, async ($, on) => {
  mock.store(on, STORE)
  const net = fakeNet(on)
  await taskCall($)
  expect(bearer(net)).toBeUndefined()
})

test('setting: malformed tokens JSON gives no token and one warning in /a2a list', { options: { tokens: '{"fake": "s3cret' } }, async ($, on) => {
  mock.store(on, STORE)
  const net = fakeNet(on)
  await taskCall($)
  expect(bearer(net)).toBeUndefined()
  const out = String((await runA2a($, 'list')).text)
  expect(out.match(/tokens setting is not valid/g)?.length).toBe(1)
  expect(out).not.toContain('s3cret')
})

test('setting: /a2a add with an alias missing from the map prints the configure command', async ($, on) => {
  mock.store(on)
  fakeNet(on)
  const out = String((await runA2a($, 'add http://worker.test w1 --token-setting')).text)
  expect(out).toContain(`claude plugin configure a2a-mod@a2a-mod --values-stdin <<< '{"tokens":"{\\"w1\\":\\"<token>\\"}"}'`)
  expect(out).toContain('replaces')
})

test('cmd: runs the argv without a shell, keeps double-quoted words, and caches the token', async ($, on) => {
  mock.store(on)
  const net = fakeNet(on)
  const argvs: (readonly string[])[] = []
  on('process.run', async (_$, e) => { argvs.push(e.argv); return ran('cmdtok\n') })
  await runA2a($, 'add http://worker.test fake --token-cmd "op read \\"op://My Vault/a2a\\""')
  await taskCall($)
  await taskCall($)
  expect(argvs).toEqual([['op', 'read', 'op://My Vault/a2a']])
  expect(bearer(net)).toBe('Bearer cmdtok')
})

test('cmd: a 401 drops the cached token, so the next call runs the command again', async ($, on) => {
  mock.store(on)
  const net = fakeNet(on)
  let runs = 0
  on('process.run', async () => { runs++; return ran(`tok${runs}`) })
  await runA2a($, 'add http://worker.test fake --token-cmd "pass show a2a/fake"')
  await taskCall($)
  net.state.status = 401
  expect(String((await taskCall($)).result)).toContain('HTTP 401')
  net.state.status = 200
  await taskCall($)
  expect(runs).toBe(2)
  expect(bearer(net)).toBe('Bearer tok2')
})

test('cmd: a failing or silent command gives an error without its output', async ($, on) => {
  mock.store(on)
  const net = fakeNet(on)
  let answer = ran('LEAKED-STDOUT', 3)
  on('process.run', async () => answer)
  await runA2a($, 'add http://worker.test fake --token-cmd "pass show a2a/fake"')
  const before = net.calls.length
  const failed = String((await taskCall($)).result)
  expect(failed).toContain('exit')
  expect(failed).not.toContain('LEAKED')
  expect(net.calls.length).toBe(before)
  answer = ran('  \n')
  expect(String((await taskCall($)).result)).toContain('printed nothing')
})

test('file: reads the token file, trims it, and caches it', async ($, on) => {
  mock.store(on)
  const net = fakeNet(on)
  const paths: string[] = []
  on('fs.read', async (_$, e) => { paths.push(e.path); return { value: 'filetok\n' } })
  await runA2a($, 'add http://worker.test fake --token-file /home/me/.a2a/fake.token')
  await taskCall($)
  await taskCall($)
  expect(paths).toEqual(['/home/me/.a2a/fake.token'])
  expect(bearer(net)).toBe('Bearer filetok')
})

test('file: an unreadable token file gives an error that names the file only', async ($, on) => {
  mock.store(on)
  fakeNet(on)
  on('fs.read', async () => { throw new Error('EACCES') })
  await runA2a($, 'add http://worker.test fake --token-file /home/me/fake.token')
  expect(String((await taskCall($)).result)).toContain('could not read the token file /home/me/fake.token')
})

test('/a2a add refuses --token with a value and stores nothing', async ($, on) => {
  mock.store(on)
  const net = fakeNet(on)
  expect(String((await runA2a($, 'add http://worker.test fake --token s3cret')).text)).toContain('not accepted')
  expect(net.calls.length).toBe(0)
  expect(String((await runA2a($, 'list')).text)).toContain('No workers')
})

test('/a2a add takes at most one token source', async ($, on) => {
  mock.store(on)
  fakeNet(on)
  expect(String((await runA2a($, 'add http://worker.test fake --token-file /a --token-cmd "b"')).text)).toContain('one of')
})

for (const source of ['setting', 'cmd', 'file'] as const) {
  test(`no ${source} token appears in any text`, { options: { tokens: JSON.stringify({ fake: 'tok-setting' }) } }, async ($, on) => {
    const token = `tok-${source}`
    mock.store(on)
    on('process.run', async () => ran('tok-cmd'))
    on('fs.read', async () => ({ value: 'tok-file' }))
    fakeNet(on, { send: { jsonrpc: '2.0', id: 1, result: { task: echoing(token).result } }, get: echoing(token) })
    const flag = source === 'setting' ? '--token-setting' : source === 'cmd' ? '--token-cmd "pass show x"' : '--token-file /t'
    const texts = [
      String((await runA2a($, `add http://worker.test fake ${flag}`)).text),
      String((await $.tool.call({ tool: 'mcp__a2a-mod__send', worker: 'fake', message: 'hi' })).result),
      String((await taskCall($)).result),
      String((await $.tool.call({ tool: 'mcp__a2a-mod__workers' })).result),
      String((await runA2a($, 'list')).text),
    ]
    expect(texts[1]).toContain('[token]')
    for (const t of texts) expect(t).not.toContain(token)
  })
}
