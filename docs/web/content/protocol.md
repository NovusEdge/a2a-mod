---
title: Protocol support
description: Which A2A versions and bindings the mod speaks, and what it leaves out.
order: 9
section: Reference
---

For people building workers: what the mod needs from your Agent Card and endpoint. In short: A2A 1.0 or 0.3, the JSON-RPC binding, a send that returns immediately, and `GetTask` for polling. [Write a worker](/write-a-worker) has a working example.

## Versions

The mod speaks A2A 1.0 and 0.3 over JSON-RPC. It reads the version from the worker's Agent Card, and it is tested end to end against @a2a-js/sdk 1.3.0.

To pick an endpoint, it looks at the card's `supportedInterfaces` for a JSON-RPC entry with protocol version 1.x, then 0.3. If there is none, it falls back to the 0.3 card fields: `url`, or the JSON-RPC entry in `additionalInterfaces`.

A card with no JSON-RPC endpoint is rejected when you add the worker.

## Methods

| Operation | A2A 1.0 | A2A 0.3 |
| --- | --- | --- |
| Send a message | `SendMessage` | `message/send` |
| Get a task | `GetTask` | `tasks/get` |
| Cancel a task | `CancelTask` | `tasks/cancel` |

The mod sends the `A2A-Version: 1.0` header to 1.0 workers, and when it fetches a card. A 1.0 server that also serves 0.3 would otherwise answer with the 0.3 card.

A message asks the worker to return without waiting for the task to finish. In 1.0 that is `returnImmediately`; in 0.3 it is `blocking: false`.

## Cards and results

- The card is fetched from `/.well-known/agent-card.json`, or from the URL you gave if it ends in `.json`.
- A card that lists `securityRequirements` (1.0) or `security` (0.3) marks the worker as needing a token.
- A task is live in the `submitted` and `working` states. The mod also recognises `completed`, `failed`, `canceled`, `rejected`, `input-required` and `auth-required`.
- A result is the task's status message followed by its artifacts, as text. Data parts show as JSON. File parts show their name, type and address; inline file bytes are not shown.

## What it doesn't do (yet)

- Streaming. The mod runtime returns a whole response body at once, so there is no SSE.
- Push notifications.
- Inbound or server mode. The mod is a client only.
- The gRPC and REST bindings. JSON-RPC only.
- OAuth flows. Workers get a bearer token.
