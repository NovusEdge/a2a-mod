import { test, expect } from 'claude-code/testing'
import { fixtures as f } from './fixtures.ts'
import { discover, send, getTask, A2AError, type Fetcher } from '../hooks/client.ts'
import type { Target } from '../types/index.d.ts'

const target = (over: Partial<Target> = {}): Target => ({
  alias: 'fake', name: 'Fake Worker', description: '', cardUrl: 'http://worker.test/.well-known/agent-card.json',
  endpoint: 'http://worker.test/a2a/jsonrpc', version: '1.0', skills: [], addedAt: 0, ...over,
})

function net(answer: (url: string, body: any) => { status?: number; json: unknown }) {
  const seen: { url: string; headers: Record<string, string>; body?: string }[] = []
  const fetcher: Fetcher = async (url, init) => {
    seen.push({ url, headers: init.headers, body: init.body })
    const { status = 200, json } = answer(url, init.body ? JSON.parse(init.body) : undefined)
    return { status, ok: status < 300, text: JSON.stringify(json) }
  }
  return { fetcher, seen }
}

test('discover asks for the 1.0 card shape', async () => {
  const { fetcher, seen } = net(() => ({ json: f.card_v1 }))
  const { card } = await discover(fetcher, 'http://worker.test')
  expect(card.version).toBe('1.0')
  expect(seen[0]?.headers['A2A-Version']).toBe('1.0')
})

test('send uses the version header and bearer token', async () => {
  const { fetcher, seen } = net(() => ({ json: f.v1_send_echo }))
  await send(fetcher, target({ token: 's3cret' }), { text: 'hi' })
  expect(seen[0]?.headers['A2A-Version']).toBe('1.0')
  expect(seen[0]?.headers.Authorization).toBe('Bearer s3cret')
})

test('0.3 workers get no version header', async () => {
  const { fetcher, seen } = net(() => ({ json: f.v03_send_echo }))
  await send(fetcher, target({ version: '0.3' }), { text: 'hi' })
  expect(seen[0]?.headers['A2A-Version']).toBeUndefined()
})

test('a token is never sent to an untrusted other origin', async () => {
  const { fetcher, seen } = net(() => ({ json: f.v1_send_echo }))
  await expect(send(fetcher, target({ endpoint: 'http://elsewhere.test/rpc', token: 's3cret' }), { text: 'hi' })).rejects.toThrow('origin')
  expect(seen.length).toBe(0)
})

test('trust is for one origin only', async () => {
  const { fetcher } = net(() => ({ json: f.v1_send_echo }))
  await send(fetcher, target({ endpoint: 'http://elsewhere.test/rpc', token: 't', trustedOrigin: 'http://elsewhere.test' }), { text: 'hi' })
  await expect(send(fetcher, target({ endpoint: 'http://third.test/rpc', token: 't', trustedOrigin: 'http://elsewhere.test' }), { text: 'hi' })).rejects.toThrow('origin')
})

test('without a token, another origin is allowed', async () => {
  const { fetcher } = net(() => ({ json: f.v1_send_echo }))
  await send(fetcher, target({ endpoint: 'http://api.worker.test/rpc' }), { text: 'hi' })
})

test('401 says the token is wrong without echoing it', async () => {
  const { fetcher } = net(() => ({ status: 401, json: { error: 'bad token s3cret' } }))
  const err = await send(fetcher, target({ token: 's3cret' }), { text: 'hi' }).catch(e => e)
  expect(err).toBeInstanceOf(A2AError)
  expect(String(err.message)).toContain('token')
  expect(String(err.message)).not.toContain('s3cret')
})

test('a worker that cannot be reached gives an A2AError, scrubbed', async () => {
  const down: Fetcher = async () => { throw new Error('connect ECONNREFUSED; header Bearer s3cret') }
  const err = await send(down, target({ token: 's3cret' }), { text: 'hi' }).catch(e => e)
  expect(err).toBeInstanceOf(A2AError)
  expect(String(err.message)).toContain('could not reach')
  expect(String(err.message)).not.toContain('s3cret')
})

test('a reply with no result gives an A2AError', async () => {
  const { fetcher } = net(() => ({ json: { jsonrpc: '2.0', id: 1, result: null } }))
  const err = await getTask(fetcher, target(), 'x').catch(e => e)
  expect(err).toBeInstanceOf(A2AError)
})

test('JSON-RPC errors and worker text are scrubbed', async () => {
  const { fetcher } = net(() => ({ json: { jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'no task; auth was s3cret' } } }))
  const err = await getTask(fetcher, target({ token: 's3cret' }), 'x').catch(e => e)
  expect(String(err.message)).toContain('no task')
  expect(String(err.message)).not.toContain('s3cret')

  const leaky = JSON.parse(JSON.stringify(f.v1_get_completed).replace('echo: hi', 'echo: s3cret'))
  const { fetcher: f2 } = net(() => ({ json: leaky }))
  const out = await getTask(f2, target({ token: 's3cret' }), 'x')
  expect(out.text).not.toContain('s3cret')
})
