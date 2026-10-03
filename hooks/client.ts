import type { Outcome, Target, TaskOutcome } from '../types/index.d.ts'
import { cardUrlFor, parseCard, parseSend, parseTask, rpcBody, type Op, type OpParams } from './wire.ts'

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; ok: boolean; text: string }>

export class A2AError extends Error {}

export const scrub = (text: string, token?: string) => (token ? text.replaceAll(token, '[token]') : text)

function parseJson(text: string, what: string): any {
  try { return JSON.parse(text) } catch { throw new A2AError(`${what} did not return JSON`) }
}

export async function discover(fetch: Fetcher, url: string) {
  const cardUrl = cardUrlFor(url)
  // A 1.0 server with 0.3 compat serves the 0.3 card shape when this header is absent.
  const res = await fetch(cardUrl, { method: 'GET', headers: { Accept: 'application/json', 'A2A-Version': '1.0' } })
  if (!res.ok) throw new A2AError(`fetching the Agent Card at ${cardUrl} failed with HTTP ${res.status}`)
  return { cardUrl, card: parseCard(parseJson(res.text, cardUrl), cardUrl) }
}

let nextId = 1

async function rpc(fetch: Fetcher, t: Target, op: Op, params: OpParams): Promise<unknown> {
  const origin = new URL(t.endpoint).origin
  if (t.token && origin !== new URL(t.cardUrl).origin && origin !== t.trustedOrigin) {
    throw new A2AError(`worker ${t.alias}'s endpoint ${origin} is on a different origin from its card, so its token is not sent there. If that is expected, the user re-adds it with --trust-endpoint.`)
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (t.version === '1.0') headers['A2A-Version'] = '1.0'
  if (t.token) headers.Authorization = `Bearer ${t.token}`
  const res = await fetch(t.endpoint, { method: 'POST', headers, body: rpcBody(t.version, op, params, nextId++) })
  if (res.status === 401 || res.status === 403) {
    const fix = t.tokenEnv ? `check the ${t.tokenEnv} environment variable` : `re-add it with --token-env <VAR>`
    throw new A2AError(`worker ${t.alias} refused the request (HTTP ${res.status}); its token is ${t.token ? 'wrong or expired' : 'missing'}. The user should ${fix}.`)
  }
  if (!res.ok) throw new A2AError(`worker ${t.alias} answered HTTP ${res.status}`)
  const body = parseJson(res.text, `worker ${t.alias}`)
  if (body.error) throw new A2AError(scrub(`worker ${t.alias} returned error ${body.error.code}: ${body.error.message}`, t.token))
  return body.result
}

const clean = <O extends Outcome>(o: O, token?: string): O => ({ ...o, text: scrub(o.text, token) })

export const send = async (fetch: Fetcher, t: Target, input: { text: string; contextId?: string; taskId?: string }): Promise<Outcome> =>
  clean(parseSend(t.version, await rpc(fetch, t, 'send', input)), t.token)

export const getTask = async (fetch: Fetcher, t: Target, id: string): Promise<TaskOutcome> =>
  clean(parseTask(t.version, await rpc(fetch, t, 'get', { id })), t.token)

export const cancelTask = async (fetch: Fetcher, t: Target, id: string): Promise<TaskOutcome> =>
  clean(parseTask(t.version, await rpc(fetch, t, 'cancel', { id })), t.token)
