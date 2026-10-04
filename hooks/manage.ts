import { A2AError } from './client.ts'
import { fetchWorker, forgetWorker, tokenNotes } from './command.ts'
import { printable } from './format.ts'
import { isOpen, readRecent } from './recent.ts'
import { loadWorkers, saveWorker, workerOr, type Host } from './registry.ts'

/** What the person answered: `none` when the dialog rejected (dismissed, or a -p run). */
export type Confirm = (question: string, yes: string) => Promise<'yes' | 'no' | 'none'>

const SKILLS_SHOWN = 3
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

// One line per field: the card is the worker's own text, and a newline would let it start a fake field.
const line = (s: unknown, max: number) => printable(String(s)).replace(/\s+/g, ' ').trim().slice(0, max)

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
    if (alias !== undefined && !ALIAS.test(alias)) return 'a2a: the alias may use letters, digits, ".", "_" and "-", up to 40 characters.'
    const fetched = await fetchWorker(host, url, alias, { kind: 'setting' })
    // The clash is decided on the final alias, which the card name may have supplied.
    const kept = (await loadWorkers(host))[fetched.alias]
    const w = kept ? { ...fetched, auth: kept.auth, ...(kept.trustedOrigin ? { trustedOrigin: kept.trustedOrigin } : {}) } : fetched
    const skills = w.skills.slice(0, SKILLS_SHOWN).map(s => line(s.name || s.id, 40)).join(', ') || 'none listed'
    const more = w.skills.length > SKILLS_SHOWN ? ` (+${w.skills.length - SKILLS_SHOWN} more)` : ''
    const question = [
      'Let Claude add this A2A worker?',
      `Name: ${line(w.name, 80)}`,
      `Alias: ${line(w.alias, 40)}${kept ? ' (already registered: this refreshes its card; its token source and trusted endpoint stay as they are)' : ''}`,
      `Endpoint: ${line(new URL(w.endpoint).origin, 100)}`,
      `A2A version: ${line(w.version, 10)}`,
      `Skills: ${skills}${more}`,
      `Authentication: ${w.needsAuth ? 'the card asks for a token (read from the tokens setting)' : 'the card asks for none'}`,
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
