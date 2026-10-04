import type { ClientModule } from 'claude-code'
import { barLine, lines, type BarProps } from './draw.tsx'
import { SLOW_MS } from './fx.ts'

// One client per running pane row, and it draws only the bar line: the tree, borders and task text
// stay static outside it, because a client is refused past about 1,500 coloured cells.
const RunBar: ClientModule<BarProps, number> = (p, surface) => {
  if (!p.anim) return lines(surface.elements, [barLine(p, 0, p.now - p.startedAt)])
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(SLOW_MS, () => surface.setState((surface.state ?? 0) + 1))
  }
  return lines(surface.elements, [barLine(p, surface.state ?? 0, Date.now() - p.startedAt)])
}

export default RunBar
