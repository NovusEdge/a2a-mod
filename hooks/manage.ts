import { A2AError } from './client.ts'
import { fetchWorker, forgetWorker, tokenNotes } from './command.ts'
import type { Worker } from '../types/index.d.ts'
import { plain, printable } from './format.ts'
import { isOpen, readRecent } from './recent.ts'
import { BAD_ALIAS, loadWorkers, own, saveWorker, workerOr, type Host } from './registry.ts'

/** What the person answered: `none` when the dialog rejected (dismissed, or a -p run). */
export type Confirm = (question: string, yes: string) => Promise<'yes' | 'no' | 'none'>

const SKILLS_SHOWN = 3
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

// One line per field: the card is the worker's own text, and a newline would let it start a fake field.
const line = (s: unknown, max: number) => plain(String(s)).replace(/\s+/g, ' ').trim().slice(0, max)

const ORIGIN_MAX = 100
const originOf = (url: string) => new URL(url).origin

/** What the dialog promises about the token: only what targetOf would really send. */
function authLine(host: Host, w: Worker): string {
  if (w.auth.kind === 'cmd') return `a token from the stored command is sent to this endpoint (${line(w.auth.cmd, 60)})`
  if (w.auth.kind === 'file') return `a token from the stored file is sent to this endpoint (${line(w.auth.path, 60)})`
  if (own(host.settingTokens.map, w.alias) !== undefined) return 'the token from the tokens setting is sent to this endpoint'
  return w.needsAuth ? 'the card asks for a token; none is set in the tokens setting, so none is sent' : 'the card asks for none, and none is sent'
}

const DECLINED = 'The user declined.'
const noOne = (cmd: string) => `No one to approve this; ask the user to run ${cmd} themselves.`

const answer = (a: 'yes' | 'no' | 'none', cmd: string) => (a === 'none' ? noOne(cmd) : a === 'no' ? DECLINED : undefined)

/**
 * Only url and alias are read. A token, a token command or file, and --trust-endpoint stay in
 * `/a2a add`: the worker's replies reach Claude, so they can carry an injected instruction, and a
 * tool that accepted those would let one reach the user's credentials.
 */
export async function addWorkerTool(host: Host, confirm: Confirm, input: { url?: unknown; alias?: unknown }): Promise<string> {
  const url = String(input.url ?? '')
  const alias = input.alias === undefined || input.alias === '' ? undefined : String(input.alias)
  try {
    if (!/^https?:\/\//i.test(url)) return 'a2a: the URL must start with http:// or https://.'
    if (alias === BAD_ALIAS) return `a2a: ${BAD_ALIAS} cannot be used as an alias.`
    if (alias !== undefined && !ALIAS.test(alias)) return 'a2a: the alias may use letters, digits, ".", "_" and "-", up to 40 characters.'
    let fetched: Worker
    try {
      fetched = await fetchWorker(host, url, alias, { kind: 'setting' })
    } catch {
      // The status or the error text would tell Claude what is listening at an address it picked.
      return 'Could not read an Agent Card at that URL.'
    }
    // The clash is decided on the final alias, which the card name may have supplied.
    const kept = own(await loadWorkers(host), fetched.alias)
    const move = `the user must run /a2a add ${line(url, 200)} ${line(fetched.alias, 40)} themselves`
    if (kept) {
      // The kept token source and trusted origin would follow the endpoint to a host the user never saw.
      if (originOf(kept.cardUrl) !== originOf(fetched.cardUrl) || originOf(kept.endpoint) !== originOf(fetched.endpoint)) {
        return `a2a: ${line(fetched.alias, 40)} is already registered at another address. Moving a worker to another host is not allowed here; ${move}.`
      }
    } else if (own(host.settingTokens.map, fetched.alias) !== undefined) {
      // targetOf would send that token to whatever endpoint this card names.
      return `a2a: the tokens setting already holds a token for ${line(fetched.alias, 40)}, so a new worker cannot take that alias here; ${move}.`
    }
    const w = kept ? { ...fetched, auth: kept.auth, ...(kept.trustedOrigin ? { trustedOrigin: kept.trustedOrigin } : {}) } : fetched
    const endpointOrigin = originOf(w.endpoint)
    if (endpointOrigin.length > ORIGIN_MAX) return `a2a: the worker's endpoint address is longer than ${ORIGIN_MAX} characters, so the dialog cannot show it whole.`
    const skills = w.skills.slice(0, SKILLS_SHOWN).map(s => line(s.name || s.id, 40)).join(', ') || 'none listed'
    const more = w.skills.length > SKILLS_SHOWN ? ` (+${w.skills.length - SKILLS_SHOWN} more)` : ''
    const question = [
      'Let Claude add this A2A worker?',
      `Name: ${line(w.name, 80)}`,
      `Alias: ${line(w.alias, 40)}${kept ? ' (already registered: this refreshes its card; its token source and trusted endpoint stay as they are)' : ''}`,
      `Endpoint: ${plain(endpointOrigin)}`,
      `A2A version: ${line(w.version, 10)}`,
      `Skills: ${skills}${more}`,
      `Authentication: ${authLine(host, w)}`,
    ].join('\n')
    const said = answer(await confirm(question, 'Add'), `/a2a add ${line(url, 200)}`)
    if (said) return said
    await saveWorker(host, w)
    const notes = tokenNotes(host, w)
    return [
      `Added worker ${line(w.alias, 40)}: ${line(w.name, 80)} (A2A ${line(w.version, 10)}). Call the workers tool to see its skills.`,
      ...notes.map(n => `Tell the user: ${printable(n)}`),
    ].join('\n\n')
  } catch (err) {
    if (err instanceof A2AError || err instanceof Error) return `a2a: ${line(err.message, 300)}`
    throw err
  }
}

export async function removeWorkerTool(host: Host, confirm: Confirm, input: { alias?: unknown }): Promise<string> {
  const w = await workerOr(host, input.alias)
  if (typeof w === 'string') return w
  const open = (await readRecent(host)).filter(t => t.worker === w.alias && isOpen(t)).length
  const said = answer(await confirm(`Remove ${line(w.alias, 40)}? ${open} running task(s) stop being tracked.`, 'Remove'), '/a2a remove ' + line(w.alias, 40))
  if (said) return said
  await forgetWorker(host, w.alias)
  return `Removed ${line(w.alias, 40)}.`
}
