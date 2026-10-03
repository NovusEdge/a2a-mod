import type { TokenSource, Worker } from '../types/index.d.ts'
import { discover, A2AError } from './client.ts'
import { loadWorkers, removeWorker, saveWorker, splitArgs, type Host } from './registry.ts'
import { runningTasks } from './tracker.ts'

export const USAGE = [
  'Usage:',
  '  /a2a add <url> [alias] [--token-setting | --token-cmd "<command>" | --token-file <path>] [--trust-endpoint]',
  '      (re-run to refresh; with no token flag the token comes from the tokens setting)',
  '  /a2a list',
  '  /a2a remove <alias>',
  '',
  'Never type a token here: slash commands are kept in the transcript.',
].join('\n')

const NO_TOKEN_FLAG = 'a2a: --token is not accepted, because slash commands are kept in the transcript. Use the tokens plugin setting (the default), --token-cmd or --token-file.'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'worker'

export function configureHint(alias: string): string {
  return [
    'Set it from a shell, then restart Claude Code:',
    `  claude plugin configure a2a-mod@a2a-mod --values-stdin <<< '{"tokens":"${alias}=<token>"}'`,
    'This replaces the whole tokens setting, so list every worker in it: "w1=<token> w2=<token>".',
    'Use the plugin id `claude plugin list` shows if yours is not a2a-mod@a2a-mod.',
  ].join('\n')
}

function source(auth: TokenSource): string {
  if (auth.kind === 'cmd') return `token from command: ${auth.cmd}`
  if (auth.kind === 'file') return `token from file ${auth.path}`
  return 'token from the tokens setting'
}

function describe(w: Worker, tokens: Readonly<Record<string, string>>): string {
  const skills = w.skills.map(s => `${s.id}: ${s.description || s.name}`).join('; ') || 'no skills listed'
  const hasToken = w.needsAuth || w.auth.kind !== 'setting' || w.alias in tokens
  return `${w.alias}  ${w.name} (A2A ${w.version}${hasToken ? `, ${source(w.auth)}` : ''})\n    ${w.description}\n    skills: ${skills}`
}

async function add(host: Host, words: string[]): Promise<string> {
  const sources: TokenSource[] = []
  let trust = false
  const rest: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    if (word === '--token' || word.startsWith('--token=')) return NO_TOKEN_FLAG
    if (word === '--token-setting') sources.push({ kind: 'setting' })
    else if (word === '--token-cmd' || word === '--token-file') {
      const value = words[++i]
      if (!value) return `a2a: ${word} needs a value.\n\n${USAGE}`
      sources.push(word === '--token-cmd' ? { kind: 'cmd', cmd: value } : { kind: 'file', path: value })
    }
    else if (word === '--trust-endpoint') trust = true
    else if (word.startsWith('--')) return `a2a: unknown option ${word}.\n\n${USAGE}`
    else rest.push(word)
  }
  if (sources.length > 1) return 'a2a: give a worker one of --token-setting, --token-cmd or --token-file, not several.'
  const auth = sources[0] ?? { kind: 'setting' }
  if (auth.kind === 'cmd' && !splitArgs(auth.cmd).length) return 'a2a: --token-cmd needs a command.'
  const [url, alias] = rest
  if (!url) return USAGE
  const { cardUrl, card } = await discover(host.fetch, url)
  const endpointOrigin = new URL(card.endpoint).origin
  const w: Worker = {
    ...card, cardUrl, alias: alias ?? slug(card.name), addedAt: Date.now(), auth,
    ...(trust ? { trustedOrigin: endpointOrigin } : {}),
  }
  await saveWorker(host, w)
  const notes: string[] = []
  const hasSettingToken = w.alias in host.settingTokens.map
  if (auth.kind === 'setting' && !hasSettingToken && w.needsAuth) {
    notes.push(`${w.alias}'s card asks for authentication, and the tokens setting has no token for it yet.\n${configureHint(w.alias)}`)
  }
  if ((auth.kind !== 'setting' || hasSettingToken) && endpointOrigin !== new URL(cardUrl).origin && !trust) {
    notes.push(`Its endpoint (${endpointOrigin}) is on another origin from its card, so the token is not sent until you re-add it with --trust-endpoint.`)
  }
  return [`Added worker:\n${describe(w, host.settingTokens.map)}`, ...notes].join('\n\n')
}

export async function runCommand(host: Host, args: string): Promise<string> {
  try {
    const [sub, ...words] = splitArgs(args.trim())
    switch (sub) {
      case 'add': return await add(host, words)
      case 'list': {
        const all = Object.values(await loadWorkers(host))
        const workers = all.length ? all.map(w => describe(w, host.settingTokens.map)).join('\n\n') : 'No workers registered. Add one with /a2a add <url>.'
        const warning = host.settingTokens.invalid
          ? '\n\nWarning: the tokens setting is not valid (it should be alias=token pairs separated by spaces), so no worker gets a token from it.'
          : ''
        const now = Date.now()
        const tasks = (await runningTasks(host)).map(t => `  ${t.worker} ${t.taskId} ${t.state}, ${Math.round((now - t.startedAt) / 1000)}s`)
        return `${workers}${warning}${tasks.length ? `\n\nRunning:\n${tasks.join('\n')}` : ''}`
      }
      case 'remove': return words[0] && (await removeWorker(host, words[0])) ? `Removed ${words[0]}.` : `No worker named ${words[0] ?? '(none given)'}.`
      default: return USAGE
    }
  } catch (err) {
    if (err instanceof A2AError || err instanceof Error) return `a2a: ${err.message}`
    throw err
  }
}
