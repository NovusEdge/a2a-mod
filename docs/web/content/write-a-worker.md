---
title: Write a worker
description: A minimal worker built on @a2a-js/sdk, and a checklist for any other stack.
order: 8
section: Build
---

A worker is an HTTP server that publishes an Agent Card and answers a few JSON-RPC calls. This page builds the smallest one on @a2a-js/sdk, then lists what the mod needs so you can check a worker built on anything else.

## A minimal worker

This worker takes a message, waits 15 seconds as if it were thinking, and replies with the message in capitals. The wait is long enough to see the background path in [How it works](/how-it-works). It is based on the fake worker in `test/fake-worker.ts`.

You need Node 24, and `@a2a-js/sdk` and `express` installed. The mod is tested against @a2a-js/sdk 1.3.0.

```ts title="shout-worker.ts"
import express from 'express'
import { randomUUID } from 'node:crypto'
import { A2A_PROTOCOL_VERSION, AGENT_CARD_PATH, TaskState } from '@a2a-js/sdk'
import type { AgentCard } from '@a2a-js/sdk'
import {
  AgentEvent, DefaultRequestHandler, InMemoryTaskStore,
  type AgentExecutor, type ExecutionEventBus, type RequestContext,
} from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import { duplicateInterfacesForLegacy } from '@a2a-js/sdk/compat/v0_3'

const port = Number(process.env.PORT ?? 41242)
const url = `http://127.0.0.1:${port}`

const now = () => new Date().toISOString()

class Shout implements AgentExecutor {
  cancelTask = async () => {}

  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx
    // The first event is the task itself. The handler answers the caller
    // as soon as it sees it, which is what lets send return at once.
    bus.publish(AgentEvent.task({
      id: taskId, contextId, artifacts: [], history: [userMessage], metadata: undefined,
      status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: now() },
    }))
    bus.publish(AgentEvent.statusUpdate({
      taskId, contextId, metadata: {},
      status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: now() },
    }))

    await new Promise(resolve => setTimeout(resolve, 15_000))

    const input = userMessage.parts.map(p => (p.content?.$case === 'text' ? p.content.value : '')).join(' ')
    bus.publish(AgentEvent.artifactUpdate({
      taskId, contextId, append: false, lastChunk: true, metadata: undefined,
      artifact: {
        artifactId: randomUUID(), name: 'result', description: '', metadata: undefined, extensions: [],
        parts: [{ content: { $case: 'text', value: input.toUpperCase() }, metadata: undefined, filename: '', mediaType: 'text/plain' }],
      },
    }))
    bus.publish(AgentEvent.statusUpdate({
      taskId, contextId, metadata: {},
      status: { state: TaskState.TASK_STATE_COMPLETED, message: undefined, timestamp: now() },
    }))
  }
}

const card: AgentCard = {
  name: 'Shout',
  description: 'Shouts your message back after 15 seconds.',
  // Lists the endpoint for A2A 1.0 and again for 0.3, so the mod can use either.
  supportedInterfaces: duplicateInterfacesForLegacy(
    [{ url: `${url}/a2a/jsonrpc`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: A2A_PROTOCOL_VERSION }],
    ['JSONRPC'],
  ),
  provider: undefined,
  version: '0.1.0',
  capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
  securitySchemes: {}, securityRequirements: [],
  defaultInputModes: ['text'], defaultOutputModes: ['text'],
  skills: [{ id: 'shout', name: 'Shout', description: 'Replies in capitals.', tags: [], examples: ['hello'], inputModes: ['text'], outputModes: ['text'], securityRequirements: [] }],
  signatures: [],
}

const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new Shout())
const app = express()
app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: handler, legacyCompat: { enabled: true } }))
app.use('/a2a/jsonrpc', jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication, legacyCompat: { enabled: true } }))
app.listen(port, () => console.log(`shout worker on ${url}`))
```

Run it and register it:

```sh title="shell"
node shout-worker.ts
```

```text title="claude code"
/a2a add http://127.0.0.1:41242 shout
```

Then ask Claude to send `hello` to the shout worker. Claude gets a task id after about 7.5 seconds, and the wake message arrives with `HELLO` when the 15 seconds are up.

## Checklist for any worker

If your worker is not built on @a2a-js/sdk, check each line. Every one comes from what the mod does when it adds a worker and sends a task.

- **The card is at `/.well-known/agent-card.json`**, or you give `/a2a add` the full URL of a card that ends in `.json`. It has a `name`; a JSON document without one is rejected.
- **The card lists a JSON-RPC endpoint.** For A2A 1.0, that is an entry in `supportedInterfaces` with `protocolBinding` `JSONRPC` and a `protocolVersion` that starts with `1.`. For 0.3, a `protocolVersion` starting `0.3`, or the older `url` field. gRPC and REST are not used.
- **Serve the 1.0 card when asked for it.** The mod sends `A2A-Version: 1.0` when it fetches the card and on every 1.0 call. A server that speaks both versions must answer that header with the 1.0 card.
- **Honour `returnImmediately` (1.0) and `blocking: false` (0.3).** The mod sets one of them on every send. Answer with the task in `submitted` or `working` state straight away, not when the work is done. @a2a-js/sdk does this for you.
- **Answer `GetTask` (1.0) or `tasks/get` (0.3).** The mod polls it at 0.5, 1, 2 and 4 seconds, then every 5 seconds. Return the task with its current `status.state`. Polls that fail 6 times in a row make the mod give up on the task.
- **Use the standard task states.** `submitted` and `working` mean the task is still live. Any other state ends it: `completed`, `failed`, `canceled`, `rejected`, `input-required` and `auth-required`. A state the mod does not know also ends it.
- **Put the result in text.** The mod shows the task's status message, then its artifacts. Text parts show as text, data parts as JSON, and file parts as name, type and address.
- **Support `CancelTask` (1.0) or `tasks/cancel` (0.3)** if you want Claude to be able to cancel.
- **Ask for input with `input-required`.** The mod wakes Claude, and Claude answers by sending again with the same `taskId`.
- **If the worker needs a token, say so in the card.** List a scheme in `securityRequirements` (1.0) or `security` (0.3). The mod then sends `Authorization: Bearer <token>`. Answer a missing or wrong token with HTTP 401 or 403, so the mod drops its cached copy and fetches a fresh one.
- **Keep the endpoint on the card's origin** if it needs a token. The mod withholds the token from any other origin unless you add the worker with `--trust-endpoint`. [Worker tokens](/tokens) has the details.

[Protocol support](/protocol) lists the methods and what the mod leaves out.
