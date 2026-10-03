import type { Outcome, ProtocolVersion, Skill, TaskOutcome, TaskState, Worker } from '../types/index.d.ts'

export type Op = 'send' | 'get' | 'cancel'
export type OpParams = { text: string; contextId?: string; taskId?: string } | { id: string }
export type CardInfo = Pick<Worker, 'name' | 'description' | 'cardUrl' | 'endpoint' | 'version' | 'skills' | 'needsAuth'>

const METHODS: Record<ProtocolVersion, Record<Op, string>> = {
  '1.0': { send: 'SendMessage', get: 'GetTask', cancel: 'CancelTask' },
  '0.3': { send: 'message/send', get: 'tasks/get', cancel: 'tasks/cancel' },
}
const STATES = new Set<TaskState>(['submitted', 'working', 'completed', 'failed', 'canceled', 'rejected', 'input-required', 'auth-required'])

type Json = Record<string, any>

export function cardUrlFor(url: string): string {
  const u = new URL(url)
  return u.pathname.endsWith('.json') ? u.href : new URL('/.well-known/agent-card.json', u).href
}

export function parseCard(raw: unknown, cardUrl: string): CardInfo {
  const card = raw as Json
  if (typeof card?.name !== 'string') throw new Error('that URL did not return an A2A Agent Card')
  const skills: Skill[] = (Array.isArray(card.skills) ? card.skills : []).map((s: Json) => ({
    id: String(s.id ?? ''), name: String(s.name ?? s.id ?? ''), description: String(s.description ?? ''),
  }))
  const some = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0)
  // 1.0 says securityRequirements, 0.3 says security; either one naming a scheme means a token.
  const needsAuth = some(card.securityRequirements) || some(card.security)
  const base = { name: card.name, description: String(card.description ?? ''), cardUrl, skills, needsAuth }
  const ifaces: Json[] = Array.isArray(card.supportedInterfaces) ? card.supportedInterfaces : []
  const jsonrpc = (major: string) => ifaces.find(i => i.protocolBinding === 'JSONRPC' && String(i.protocolVersion).startsWith(major))
  const v1 = jsonrpc('1.')
  if (v1) return { ...base, endpoint: new URL(v1.url, cardUrl).href, version: '1.0' }
  const v03 = jsonrpc('0.3')
  if (v03) return { ...base, endpoint: new URL(v03.url, cardUrl).href, version: '0.3' }
  const legacy = (card.preferredTransport ?? 'JSONRPC') === 'JSONRPC'
    ? card.url
    : (card.additionalInterfaces as Json[] | undefined)?.find(i => i.transport === 'JSONRPC')?.url
  if (typeof legacy === 'string') return { ...base, endpoint: new URL(legacy, cardUrl).href, version: '0.3' }
  throw new Error('the card lists no JSON-RPC endpoint; a2a-mod only speaks the JSON-RPC binding')
}

export function rpcBody(version: ProtocolVersion, op: Op, params: OpParams, id: number): string {
  let p: Json
  if ('text' in params) {
    const ids = { ...(params.contextId ? { contextId: params.contextId } : {}), ...(params.taskId ? { taskId: params.taskId } : {}) }
    p = version === '1.0'
      ? { message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', parts: [{ text: params.text }], ...ids }, configuration: { returnImmediately: true } }
      : { message: { kind: 'message', messageId: crypto.randomUUID(), role: 'user', parts: [{ kind: 'text', text: params.text }], ...ids }, configuration: { blocking: false } }
  } else {
    p = { id: params.id }
  }
  return JSON.stringify({ jsonrpc: '2.0', id, method: METHODS[version][op], params: p })
}

export function stateOf(raw: unknown): TaskState {
  const s = String(raw ?? '').replace(/^TASK_STATE_/, '').toLowerCase().replace(/_/g, '-') as TaskState
  return STATES.has(s) ? s : 'unknown'
}

// Anything else, including a state this client does not recognise, ends tracking:
// a task stuck in an unknown state would otherwise be polled forever.
export const isLive = (s: TaskState) => s === 'submitted' || s === 'working'

function partText(p: Json): string {
  if (typeof p.text === 'string') return p.text
  if (p.data !== undefined) return JSON.stringify(p.data, null, 2)
  const file = p.file ?? p
  const name = file.name ?? file.filename ?? 'file'
  const type = file.mimeType ?? file.mediaType ?? ''
  if (typeof (file.uri ?? file.url) === 'string') return `[${name} ${type} ${file.uri ?? file.url}]`
  if (file.bytes !== undefined || file.raw !== undefined) return `[${name} ${type}, inline bytes not shown]`
  return ''
}

const partsText = (parts: unknown) => (Array.isArray(parts) ? parts.map(partText).filter(Boolean).join('\n') : '')

function taskOutcome(t: Json): TaskOutcome {
  const said = partsText(t.status?.message?.parts)
  const made = (Array.isArray(t.artifacts) ? t.artifacts : []).map((a: Json) => partsText(a.parts)).filter(Boolean).join('\n\n')
  return { kind: 'task', taskId: String(t.id), contextId: t.contextId || undefined, state: stateOf(t.status?.state), text: [said, made].filter(Boolean).join('\n\n') }
}

export function parseTask(version: ProtocolVersion, result: unknown): TaskOutcome {
  const r = result as Json
  return taskOutcome(version === '1.0' && r?.task ? r.task : r)
}

export function parseSend(version: ProtocolVersion, result: unknown): Outcome {
  const r = result as Json
  const msg = version === '1.0' ? r?.message : r?.kind === 'message' ? r : undefined
  if (msg) return { kind: 'message', contextId: msg.contextId || undefined, text: partsText(msg.parts) }
  return parseTask(version, r)
}
