import type { RecentTask } from '../../types/index.d.ts'
import { isRunning, isWaiting } from '../recent.ts'
import { clock, fit, spinner } from './fx.ts'
import { STATES } from './states.ts'

/** How long a finished task stays on the status line when nothing else is live. */
export const DONE_MS = 5000
/** The status line steps once a second: the spinner frame and the elapsed time. */
export const STATUS_MS = 1000
const TEXT_MAX = 32

const ended = (t: RecentTask) => t.endedAt !== undefined

/**
 * The status line, plain text because the slot takes none; undefined clears it.
 * Worker text goes through `fit`, which strips control characters.
 */
export function statusText(rows: readonly RecentTask[], now: number, anim: boolean): string | undefined {
  const running = rows.filter(t => isRunning(t.state))
  const waiting = rows.filter(t => isWaiting(t.state))
  const more = waiting.length ? ` · ${waiting.length} waiting` : ''
  const glyph = anim ? spinner(Math.floor(now / STATUS_MS)) : '●'
  if (running.length === 1) {
    const t = running[0]!
    return `a2a ${glyph} ${fit(t.worker, 16)} ${fit(t.text, TEXT_MAX)} ${clock(now - t.startedAt)}${more}`
  }
  if (running.length) return `a2a ${glyph} ${running.length} running${more}`
  if (waiting.length === 1) {
    const t = waiting[0]!
    return `a2a ? ${fit(t.worker, 16)} waiting: ${fit(t.result ?? '', TEXT_MAX)}`
  }
  if (waiting.length) return `a2a ? ${waiting.length} waiting`
  const last = rows.filter(t => ended(t) && now - t.endedAt! < DONE_MS).sort((a, b) => b.endedAt! - a.endedAt!)[0]
  if (!last) return undefined
  const look = STATES[last.state]
  const what = last.state === 'completed' ? 'done' : look.label
  return `a2a ${look.glyph} ${fit(last.worker, 16)} ${what} ${clock(last.endedAt! - last.startedAt)}`
}
