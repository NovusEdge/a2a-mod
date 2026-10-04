---
title: Quick start
description: Try the mod against the fake worker that ships in the repo.
order: 2
section: Start
---

No real agent needed. Run the fake worker that ships with the repo, register it, and send it a slow task to watch the result come back on its own.

## Start the fake worker

The fake worker echoes, waits, or asks a question back. It needs Node 24 and pnpm.

```sh title="shell"
git clone https://github.com/NovusEdge/a2a-mod && cd a2a-mod
pnpm i && pnpm worker
```

The worker listens on `http://127.0.0.1:41241`. Set `PORT` to change it.

## Register it

In Claude Code, with the mod [installed](/):

```text title="claude code"
/a2a add http://127.0.0.1:41241 fake
```

The mod fetches the worker's Agent Card and registers it under the alias `fake`. The fake worker needs no token.

## Ask Claude to use it

Give Claude these two prompts, one after the other:

```text title="claude code"
list the a2a workers
send "slow 20 build" to the fake worker
```

The first prompt gets an inline reply that lists the worker and its skills.

The second is a task that takes 20 seconds. Claude gets a task id back after about 7 seconds and carries on. The status line shows the task while it runs:

```text title="status line"
a2a ⠋ fake slow 20 build 0:12
```

When the worker finishes, the line reads `a2a ✓ fake done 0:20` for 5 seconds, and the mod wakes Claude with the result.

## What the fake worker understands

| Message | Reply |
| --- | --- |
| `slow <seconds> <text>` | Waits that many seconds, then replies `done: <text>`. Cancel it with the `task` tool and it stops early. |
| `ask <thing>` | Asks `Which <thing>?` and waits. The task ends up in the `input-required` state until Claude answers with the same `taskId`. |
| anything else | Replies `echo: <your message>`. |

## Next

[Commands and tools](/commands) has the full list of `/a2a` subcommands. To point the mod at a real worker that needs a token, read [Worker tokens](/tokens). To build your own worker, read [Write a worker](/write-a-worker).
