import express from 'express'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { A2A_PROTOCOL_VERSION, AGENT_CARD_PATH, Role, TaskState } from '@a2a-js/sdk'
import type { AgentCard, Message, Part } from '@a2a-js/sdk'
import {
  AgentEvent, DefaultRequestHandler, InMemoryTaskStore,
  type AgentExecutor, type ExecutionEventBus, type RequestContext,
} from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import { duplicateInterfacesForLegacy } from '@a2a-js/sdk/compat/v0_3'

const text = (value: string): Part => ({ content: { $case: 'text', value }, metadata: undefined, filename: '', mediaType: 'text/plain' })
const agentMessage = (taskId: string, contextId: string, value: string): Message => ({
  role: Role.ROLE_AGENT, messageId: randomUUID(), parts: [text(value)], taskId, contextId,
  extensions: [], metadata: {}, referenceTaskIds: [],
})
const status = (taskId: string, contextId: string, state: TaskState, message?: Message) =>
  AgentEvent.statusUpdate({ taskId, contextId, status: { state, message, timestamp: new Date().toISOString() }, metadata: {} })

class FakeExecutor implements AgentExecutor {
  private readonly cancels = new Map<string, () => void>()

  cancelTask = async (taskId: string) => { this.cancels.get(taskId)?.() }

  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx
    const input = userMessage.parts.map(p => (p.content?.$case === 'text' ? p.content.value : '')).join(' ').trim()
    const [verb = '', ...rest] = input.split(/\s+/)
    // Republishing an existing task resets the follow-up's state to the old one.
    if (!ctx.task) {
      bus.publish(AgentEvent.task({
        id: taskId, contextId, artifacts: [], history: [userMessage], metadata: undefined,
        status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: new Date().toISOString() },
      }))
    }
    bus.publish(status(taskId, contextId, TaskState.TASK_STATE_WORKING))

    if (verb === 'ask' && !ctx.task) {
      bus.publish(status(taskId, contextId, TaskState.TASK_STATE_INPUT_REQUIRED, agentMessage(taskId, contextId, `Which ${rest.join(' ')}?`)))
      return
    }
    if (verb === 'slow') {
      const seconds = Number(rest.shift() ?? 10)
      const canceled = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), seconds * 1000)
        this.cancels.set(taskId, () => { clearTimeout(timer); resolve(true) })
      })
      this.cancels.delete(taskId)
      if (canceled) {
        bus.publish(status(taskId, contextId, TaskState.TASK_STATE_CANCELED))
        return
      }
    }
    const reply = verb === 'slow' ? `done: ${rest.join(' ')}` : `echo: ${input}`
    bus.publish(AgentEvent.artifactUpdate({
      taskId, contextId, append: false, lastChunk: true, metadata: undefined,
      artifact: { artifactId: randomUUID(), name: 'result', description: '', parts: [text(reply)], metadata: undefined, extensions: [] },
    }))
    bus.publish(status(taskId, contextId, TaskState.TASK_STATE_COMPLETED))
  }
}

export async function startWorker(port = 0): Promise<{ url: string; close(): Promise<void> }> {
  const app = express()
  const server = app.listen(port)
  await new Promise<void>(r => server.once('listening', () => r()))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const card: AgentCard = {
    name: 'Fake Worker',
    description: 'Echoes, waits, or asks a question. Test double for a2a-mod.',
    supportedInterfaces: duplicateInterfacesForLegacy(
      [{ url: `${url}/a2a/jsonrpc`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: A2A_PROTOCOL_VERSION }],
      ['JSONRPC'],
    ),
    provider: undefined,
    version: '0.1.0',
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: {}, securityRequirements: [],
    defaultInputModes: ['text'], defaultOutputModes: ['text'],
    skills: [
      { id: 'echo', name: 'Echo', description: 'Replies with the input.', tags: [], examples: ['hi'], inputModes: ['text'], outputModes: ['text'], securityRequirements: [] },
      { id: 'slow', name: 'Slow', description: 'slow <seconds> <text>: finishes after a delay.', tags: [], examples: ['slow 12 build'], inputModes: ['text'], outputModes: ['text'], securityRequirements: [] },
      { id: 'ask', name: 'Ask', description: 'ask <thing>: asks a question back first.', tags: [], examples: ['ask colour'], inputModes: ['text'], outputModes: ['text'], securityRequirements: [] },
    ],
    signatures: [],
  }

  const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new FakeExecutor())
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: handler, legacyCompat: { enabled: true } }))
  app.use('/a2a/jsonrpc', jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication, legacyCompat: { enabled: true } }))

  return { url, close: () => new Promise(r => server.close(() => r())) }
}

if (import.meta.main) {
  const { url } = await startWorker(Number(process.env.PORT ?? 41241))
  console.log(`fake worker on ${url}`)
}
