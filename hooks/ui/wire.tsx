import type { ClientModule } from 'claude-code'
import { lines, wireCells, type WireProps } from './draw.tsx'
import { PHASE_MS, SLOW_MS, type Direction } from './fx.ts'

// `dir` is copied into state because the timers' closure keeps the first render's props.
type Clock = { slow: number; phase: number; dir: Direction }

const Wire: ClientModule<WireProps, Clock> = (p, surface) => {
  if (!p.anim) return lines(surface.elements, [wireCells(p, 0, 0)])
  let s = surface.state
  if (s === undefined) {
    s = { slow: 0, phase: 0, dir: p.dir }
    surface.setState(s)
    surface.every(SLOW_MS, () => {
      const c = surface.state!
      if (c.dir !== 'idle') surface.setState({ ...c, slow: c.slow + 1 })
    })
    surface.every(PHASE_MS, () => {
      const c = surface.state!
      if (c.dir !== 'idle') surface.setState({ ...c, phase: c.phase + 1 })
    })
  } else if (s.dir !== p.dir) {
    s = { ...s, dir: p.dir }
    surface.setState(s)
  }
  return lines(surface.elements, [wireCells(p, s.slow, s.phase)])
}

export default Wire
