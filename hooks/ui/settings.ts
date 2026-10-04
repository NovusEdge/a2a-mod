export type Layout = 'full' | 'pane' | 'minimal'
export type UiSettings = { layout: Layout; animations: boolean }

const LAYOUTS: readonly Layout[] = ['full', 'pane', 'minimal']

export function parseSettings(options: Readonly<Record<string, unknown>>): UiSettings {
  return {
    layout: LAYOUTS.find(l => l === options.layout) ?? 'full',
    animations: options.animations !== false,
  }
}
