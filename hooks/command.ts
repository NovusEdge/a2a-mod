import type { Worker } from '../types/index.d.ts'
import { discover, A2AError } from './client.ts'
import { isTokenEnv, loadWorkers, removeWorker, saveWorker, TOKEN_ENVS, type Host } from './registry.ts'

export const USAGE = [
  'Usage:',
  '  /a2a add <url> [alias] [--token-env VAR] [--trust-endpoint]   (re-run to refresh)',
  '  /a2a list',
  '  /a2a remove <alias>',
  '',
  `Put the worker token in one of ${TOKEN_ENVS[0]} .. ${TOKEN_ENVS.at(-1)} and pass that name.`,
  'Never type a token here: slash commands are kept in the transcript.',
].join('\n')

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'worker'

function describe(w: Worker): string {
  const skills = w.skills.map(s => `${s.id}: ${s.description || s.name}`).join('; ') || 'no skills listed'
  const auth = w.tokenEnv ? `, token from $${w.tokenEnv}` : ''
  return `${w.alias}  ${w.name} (A2A ${w.version}${auth})\n    ${w.description}\n    skills: ${skills}`
}

async function add(host: Host, words: string[]): Promise<string> {
  let tokenEnv: string | undefined
  let trust = false
  const rest: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    if (word === '--token-env') tokenEnv = words[++i]
    else if (word === '--trust-endpoint') trust = true
    else if (word === '--token') return 'a2a: --token is not accepted, because slash commands are kept in the transcript. Put the token in an environment variable and use --token-env VAR.'
    else rest.push(word)
  }
  const [url, alias] = rest
  if (!url) return USAGE
  if (tokenEnv !== undefined && !isTokenEnv(tokenEnv)) {
    return `a2a: --token-env must be one of ${TOKEN_ENVS.join(', ')}. Claude Code lets a mod read only environment variables named in its source.`
  }
  const { cardUrl, card } = await discover(host.fetch, url)
  const endpointOrigin = new URL(card.endpoint).origin
  const w: Worker = {
    ...card, cardUrl, alias: alias ?? slug(card.name), addedAt: Date.now(),
    ...(tokenEnv ? { tokenEnv } : {}),
    ...(trust ? { trustedOrigin: endpointOrigin } : {}),
  }
  await saveWorker(host, w)
  const notes: string[] = []
  if (tokenEnv && !(await host.env(tokenEnv))) notes.push(`${tokenEnv} is not set in this session's environment; calls go without a token until it is.`)
  if (tokenEnv && endpointOrigin !== new URL(cardUrl).origin && !trust) {
    notes.push(`Its endpoint (${endpointOrigin}) is on another origin from its card, so the token is not sent until you re-add it with --trust-endpoint.`)
  }
  return [`Added worker:\n${describe(w)}`, ...notes].join('\n\n')
}

export async function runCommand(host: Host, args: string): Promise<string> {
  const [sub, ...words] = args.trim().split(/\s+/).filter(Boolean)
  try {
    switch (sub) {
      case 'add': return await add(host, words)
      case 'list': {
        const all = Object.values(await loadWorkers(host))
        return all.length ? all.map(describe).join('\n\n') : 'No workers registered. Add one with /a2a add <url>.'
      }
      case 'remove': return words[0] && (await removeWorker(host, words[0])) ? `Removed ${words[0]}.` : `No worker named ${words[0] ?? '(none given)'}.`
      default: return USAGE
    }
  } catch (err) {
    if (err instanceof A2AError || err instanceof Error) return `a2a: ${err.message}`
    throw err
  }
}
