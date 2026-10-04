import { test, expect } from 'claude-code/testing'
import { parseSettings } from '../hooks/ui/settings.ts'
import { statusText } from '../hooks/ui/status.ts'

test('settings fall back to the full layout with animations on', () => {
  expect(parseSettings({})).toEqual({ layout: 'full', animations: true })
  expect(parseSettings({ layout: 'minimal', animations: false })).toEqual({ layout: 'minimal', animations: false })
  expect(parseSettings({ layout: 'sideways' }).layout).toBe('full')
})

test('the status line counts running and waiting tasks, and clears at zero', () => {
  expect(statusText(2, 0)).toBe('a2a: 2 running')
  expect(statusText(1, 1)).toBe('a2a: 1 running · 1 waiting')
  expect(statusText(0, 1)).toBe('a2a: 0 running · 1 waiting')
  expect(statusText(0, 0)).toBeUndefined()
})
