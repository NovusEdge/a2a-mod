import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'workers',
      description: 'List the A2A worker agents the user registered, with their skills.',
      inputSchema: { type: 'object', properties: {} },
    })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__a2a-mod__workers' }, async () => ({ result: 'No workers registered. The user adds one with /a2a add <url>.' }))
}
