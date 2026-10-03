import { test, expect } from 'claude-code/testing'

test('the workers tool answers', async $ => {
  const ran = await $.tool.call({ tool: 'mcp__a2a-mod__workers' })
  expect(String(ran.result)).toContain('/a2a add')
})
