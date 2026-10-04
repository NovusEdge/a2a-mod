import type { ClientModule } from 'claude-code'
import type { RecentState } from '../../types/index.d.ts'
import { isRunning } from '../recent.ts'
import { lines, rowLines, stillTick, type RowProps } from './draw.tsx'
import { FAST_MS, PULSE_MS, SLOW_MS } from './fx.ts'

type Clock = { fast: number; slow: number; seen: RecentState; pulseUntil: number }

// Both timers run for the client's life but only redraw while the row runs or pulses:
// a finished row's client stays mounted until the pane next redraws.
const Row: ClientModule<RowProps, Clock> = (p, surface) => {
  if (!p.anim) return lines(surface.elements, rowLines(p, stillTick(p)))
  let s = surface.state
  if (s === undefined) {
    s = { fast: 0, slow: 0, seen: p.state, pulseUntil: -1 }
    surface.setState(s)
    surface.every(FAST_MS, () => {
      const c = surface.state!
      if (isRunning(c.seen) || c.fast < c.pulseUntil) surface.setState({ ...c, fast: c.fast + 1 })
    })
    surface.every(SLOW_MS, () => {
      const c = surface.state!
      if (isRunning(c.seen)) surface.setState({ ...c, slow: c.slow + 1 })
    })
  } else if (s.seen !== p.state) {
    s = { ...s, seen: p.state, pulseUntil: s.fast + PULSE_MS / FAST_MS }
    surface.setState(s)
  }
  const dim = s.fast < s.pulseUntil && s.fast % 4 < 2
  return lines(surface.elements, rowLines(p, { fast: s.fast, slow: s.slow, elapsedMs: Date.now() - p.startedAt, dim }))
}

export default Row
