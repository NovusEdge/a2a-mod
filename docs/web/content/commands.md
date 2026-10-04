---
title: Commands and tools
description: The /a2a commands you run, and the three tools Claude calls.
order: 4
section: Use
---

You run one command, `/a2a`, to add, list and remove workers. Claude gets three tools, `workers`, `send` and `task`, and calls them itself when you ask it to use a worker.

## The /a2a command

Run `/a2a` with no arguments to open the workers pane and print the usage text. With the `minimal` layout there is no pane, so you get the usage text only.

| Command | What it does |
| --- | --- |
| `/a2a add <url> [alias] [token flag]` | Fetch the worker's Agent Card and register it. The alias defaults to a slug of the card name. Run it again to refresh a worker. |
| `/a2a list` | Show registered workers, their skills, and running tasks with their age. |
| `/a2a remove <alias>` | Forget a worker. |

`<url>` can be the worker's base URL or the URL of its Agent Card. If it ends in `.json`, the mod fetches it as the card. Otherwise it fetches `/.well-known/agent-card.json` from that host.

A worker that needs a bearer token takes one token flag on `add`. [Worker tokens](/tokens) lists the flags and explains where each one reads the token from.

## The tools Claude sees

You do not call these tools. Claude does, when you ask it to use a worker.

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

A message from `send` goes to the worker as a plain text message. The mod asks the worker to return at once instead of holding the connection, then polls for the result. [How it works](/how-it-works) has the timing, and [Write a worker](/write-a-worker) shows the worker's side.
