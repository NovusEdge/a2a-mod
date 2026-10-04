---
title: Commands and tools
description: The /a2a commands you run, and the three tools Claude calls.
order: 3
section: Use
---

## The /a2a command

You manage workers with `/a2a`. Run it with no arguments to print the usage text.

| Command | What it does |
| --- | --- |
| `/a2a add <url> [alias]` | Fetch the worker's Agent Card and register it. The alias defaults to a slug of the card name. Run it again to refresh a worker. |
| `/a2a list` | Show registered workers, their skills, and running tasks with their age. |
| `/a2a remove <alias>` | Forget a worker. |

`add` takes these options:

| Option | What it does |
| --- | --- |
| `--token-setting` | Take the token from the `tokens` setting. This is the default. |
| `--token-cmd "<command>"` | Take the token from a command's output. |
| `--token-file <path>` | Take the token from a file. |
| `--trust-endpoint` | Allow the token to go to an endpoint on another origin than the card. |

Give a worker at most one token flag. [Worker tokens](/tokens) explains the three sources and what `--trust-endpoint` is for.

`<url>` can be the worker's base URL or the URL of its Agent Card. If it ends in `.json`, the mod fetches it as the card. Otherwise it fetches `/.well-known/agent-card.json` from that host.

Never type a token into `/a2a`. Slash commands are kept in the transcript, so `/a2a add` rejects `--token`.

## The tools Claude sees

Claude gets three tools. You do not call them; Claude does, when you ask it to use a worker.

| Tool | What it does |
| --- | --- |
| `workers` | Lists the registered workers and their skills. |
| `send` | Sends a task to a worker. It returns the answer if the worker finishes in time, and a task id otherwise. |
| `task` | Reads the full state and result of a task, or cancels it. |

`send` takes `worker` (the alias) and `message`. Pass `taskId` to answer a worker that asked for input, or `contextId` to continue a conversation.

`task` takes `worker` and `taskId`. Set `cancel` to true to cancel the task.

### Long results

`send` shows up to 8,000 characters of a result. If the worker returns more, the reply ends with a note that says how many characters were cut and points Claude to the `task` tool, which shows up to 100,000 characters.

## What a worker sees

A message from `send` goes to the worker as a plain text message. The mod asks the worker to return at once instead of holding the connection, then polls for the result. [How it works](/how-it-works) has the timing.
