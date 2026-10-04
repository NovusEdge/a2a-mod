const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/** Two-stop RGB mix of `#rrggbb` colours; `t` is clamped to 0..1. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b), k = Math.min(1, Math.max(0, t))
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * k).toString(16).padStart(2, '0')).join('')}`
}

/** The raw colours the gradient and shimmer use, for the theme the person picked. */
export type Palette = { text: string; dim: string; from: string; to: string }

export function palette(theme: unknown): Palette {
  const light = typeof theme === 'string' && theme.includes('light')
  const text = light ? '#1f2328' : '#e6edf3'
  // Pulled a quarter toward the text colour, so the gradient reads on light and dark backgrounds.
  return { text, dim: mix(text, light ? '#ffffff' : '#000000', 0.55), from: mix('#4fb3a9', text, 0.25), to: mix('#b392f0', text, 0.25) }
}
