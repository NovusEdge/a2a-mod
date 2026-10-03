import type { HttpInit, HttpResponse } from 'claude-code'
import type { Engine, TestBody } from 'claude-code/testing'
import { fixtures as f } from './fixtures.ts'

export type On = Parameters<TestBody>[1]

type Route = 'card' | 'send' | 'get' | 'cancel'
type Answer = unknown | ((body: any) => unknown)
const DEFAULTS: Record<Route, unknown> = { card: f.card_v1, send: f.v1_send_echo, get: f.v1_get_completed, cancel: f.v1_cancel }

export const TOKEN_ENV = { A2A_TOKEN_1: 's3cret' }

export const STORE = {
  workers: {
    fake: {
      alias: 'fake', name: 'Fake Worker', description: 'test double', cardUrl: 'http://worker.test/.well-known/agent-card.json',
      endpoint: 'http://worker.test/a2a/jsonrpc', version: '1.0', skills: [{ id: 'echo', name: 'Echo', description: 'Replies' }],
      tokenEnv: 'A2A_TOKEN_1', addedAt: 0,
    },
  },
}

// One http.fetch hook per test: the kit refuses a second registration on the same event.
export function fakeNet(on: On, routes: Partial<Record<Route, Answer>> = {}) {
  const calls: { url: string; init?: HttpInit }[] = []
  const state = { down: false }
  const reply = (value: HttpResponse) => ({ value })
  on('http.fetch', async (_$, e) => {
    calls.push({ url: e.url, init: e.init })
    if (state.down) return reply({ status: 503, ok: false, headers: {}, text: 'down' })
    const body = e.init?.body ? JSON.parse(e.init.body) : undefined
    const route: Route = e.url.endsWith('agent-card.json') ? 'card'
      : /send/i.test(body?.method) ? 'send' : /cancel/i.test(body?.method) ? 'cancel' : 'get'
    const answer = routes[route] ?? DEFAULTS[route]
    const json = typeof answer === 'function' ? (answer as (b: any) => unknown)(body) : answer
    return reply({ status: 200, ok: true, headers: { 'content-type': 'application/json' }, text: JSON.stringify(json) })
  })
  return { calls, state }
}

export const runA2a = ($: Engine, args = '') =>
  $.command.run({ command: 'a2a', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
