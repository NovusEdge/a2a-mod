import { test, expect, describe } from 'claude-code/testing'
import { fixtures as f } from './fixtures.ts'
import { cardUrlFor, parseCard, parseSend, parseTask, rpcBody, isLive, stateOf } from '../hooks/wire.ts'
import { truncate } from '../hooks/format.ts'

describe('cards', () => {
  test('a base URL maps to the well-known card', () => {
    expect(cardUrlFor('https://w.test')).toBe('https://w.test/.well-known/agent-card.json')
    expect(cardUrlFor('https://w.test/x/agent-card.json')).toBe('https://w.test/x/agent-card.json')
  })
  test('a 1.0 card picks its 1.x JSON-RPC interface', () => {
    const c = parseCard(f.card_v1, 'http://worker.test/.well-known/agent-card.json')
    expect(c.version).toBe('1.0')
    expect(c.endpoint).toBe('http://worker.test/a2a/jsonrpc')
    expect(c.skills.map(s => s.id)).toEqual(['echo', 'slow', 'ask'])
  })
  test('the hybrid card a compat server sends 0.3 clients still parses', () => {
    expect(parseCard(f.card_v03, 'http://worker.test/.well-known/agent-card.json').endpoint).toBe('http://worker.test/a2a/jsonrpc')
  })
  test('a pure 0.3 card is read as 0.3', () => {
    const c = parseCard({ name: 'Old', description: '', url: 'http://worker.test/rpc', protocolVersion: '0.3.0', skills: [] }, 'http://worker.test/.well-known/agent-card.json')
    expect(c.version).toBe('0.3')
    expect(c.endpoint).toBe('http://worker.test/rpc')
  })
  test('the provider organization is kept when the card names one', () => {
    expect(parseCard({ ...f.card_v1, provider: { organization: 'Acme', url: 'https://acme.test' } }, 'http://worker.test/c.json').organization).toBe('Acme')
    expect(parseCard(f.card_v1, 'http://worker.test/c.json').organization).toBeUndefined()
  })

  test('the organization loses control characters and is cut to 60 characters', () => {
    const org = (organization: string) => parseCard({ ...f.card_v1, provider: { organization } }, 'http://worker.test/c.json').organization
    expect(org('\u001b[31mAcme\u001b[0m')).toBe('Acme')
    expect(org('x'.repeat(200))?.length).toBe(60)
    expect(org('\u001b[0m')).toBeUndefined()
  })

  test('a card with no JSON-RPC interface is refused', () => {
    expect(() => parseCard({ name: 'G', supportedInterfaces: [{ url: 'x:1', protocolBinding: 'GRPC', protocolVersion: '1.0' }] }, 'http://w.test/c.json')).toThrow('JSON-RPC')
  })
})

describe('requests', () => {
  test('1.0 and 0.3 method names', () => {
    expect(JSON.parse(rpcBody('1.0', 'send', { text: 'hi' }, 1)).method).toBe('SendMessage')
    expect(JSON.parse(rpcBody('0.3', 'send', { text: 'hi' }, 1)).method).toBe('message/send')
    expect(JSON.parse(rpcBody('1.0', 'get', { id: 't' }, 1)).method).toBe('GetTask')
    expect(JSON.parse(rpcBody('0.3', 'cancel', { id: 't' }, 1)).method).toBe('tasks/cancel')
  })
  test('sends never block the worker', () => {
    expect(JSON.parse(rpcBody('1.0', 'send', { text: 'hi' }, 1)).params.configuration.returnImmediately).toBe(true)
    expect(JSON.parse(rpcBody('0.3', 'send', { text: 'hi' }, 1)).params.configuration.blocking).toBe(false)
  })
})

describe('responses', () => {
  for (const v of ['v1', 'v03'] as const) {
    const version = v === 'v1' ? '1.0' : '0.3'
    test(`${v}: completed task text comes from the artifact`, () => {
      const out = parseTask(version, f[`${v}_get_completed`].result)
      expect(out.state).toBe('completed')
      expect(out.text).toContain('echo: hi')
    })
    test(`${v}: a slow task is live`, () => {
      expect(isLive(parseTask(version, f[`${v}_get_working`].result).state)).toBe(true)
    })
    test(`${v}: input-required carries the question`, () => {
      const out = parseTask(version, f[`${v}_get_input_required`].result)
      expect(out.state).toBe('input-required')
      expect(out.text).toContain('Which colour?')
    })
    test(`${v}: send result is a task`, () => {
      expect(parseSend(version, f[`${v}_send_echo`].result).kind).toBe('task')
    })
  }
  test('unrecognised and unspecified states are not live', () => {
    expect(stateOf('TASK_STATE_UNSPECIFIED')).toBe('unknown')
    expect(isLive('unknown')).toBe(false)
  })
  test('truncate keeps short text and marks long text', () => {
    expect(truncate('abc')).toBe('abc')
    expect(truncate('x'.repeat(9000)).length).toBeLessThan(8200)
    expect(truncate('x'.repeat(9000))).toContain('truncated')
  })
})
