import type { ClientModule } from 'claude-code'
import { FAST_MS, typed } from './fx.ts'

export type TypeProps = { id: string; text: string; anim: boolean }

// Posts { played: id } once the text is out, so a redraw or reload shows it whole.
const Typewriter: ClientModule<TypeProps, number> = (p, surface) => {
  const { Text } = surface.elements
  if (!p.anim) return <Text>{p.text}</Text>
  if (surface.state === undefined) {
    surface.setState(0)
    const stop = surface.every(FAST_MS, () => {
      const frame = (surface.state ?? 0) + 1
      surface.setState(frame)
      if (typed(p.text, frame).length >= p.text.length) {
        stop()
        surface.post({ played: p.id })
      }
    })
  }
  const shown = typed(p.text, surface.state ?? 0)
  return <Text>{shown.length < p.text.length ? `${shown}▌` : shown}</Text>
}

export default Typewriter
