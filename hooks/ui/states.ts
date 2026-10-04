import type { RecentState } from '../../types/index.d.ts'

// Claude Code theme keys, so light themes and theme mods recolour the states.
export const THEME_KEYS = ['warning', 'suggestion', 'success', 'error', 'inactive'] as const
export type ThemeKey = (typeof THEME_KEYS)[number]

export type Look = { glyph: string; color: ThemeKey; label: string; short: string }

export const STATES: Record<RecentState, Look> = {
  submitted: { glyph: '●', color: 'warning', label: 'submitted', short: 'sent' },
  working: { glyph: '●', color: 'warning', label: 'working', short: 'run' },
  'input-required': { glyph: '?', color: 'suggestion', label: 'needs input', short: 'input' },
  'auth-required': { glyph: '⚿', color: 'suggestion', label: 'needs auth', short: 'auth' },
  completed: { glyph: '✓', color: 'success', label: 'completed', short: 'done' },
  failed: { glyph: '✕', color: 'error', label: 'failed', short: 'fail' },
  rejected: { glyph: '✕', color: 'error', label: 'rejected', short: 'rej' },
  canceled: { glyph: '⊘', color: 'inactive', label: 'canceled', short: 'cxl' },
  removed: { glyph: '⊘', color: 'inactive', label: 'worker removed', short: 'removed' },
  unknown: { glyph: '·', color: 'inactive', label: 'unknown', short: '?' },
}
