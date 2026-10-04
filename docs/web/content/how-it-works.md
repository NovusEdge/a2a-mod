---
title: How it works
description: The inline wait, background polling, the wake-up prompt, and what happens when a worker goes quiet.
order: 6
section: Use
---

Claude waits about 7.5 seconds for an answer. If the worker isn't done, Claude gets a task id and moves on, the mod checks the worker every 5 seconds, and Claude gets a message when the task ends.

{{diagram}}

## The inline window

When Claude calls `send`, the mod forwards the message to the worker and asks for a task back right away. It then polls the worker with `GetTask` after 0.5, 1, 2 and 4 seconds. That is the inline window, about 7.5 seconds in all.

If the task finishes inside the window, the result goes straight back to Claude as the tool result.

The mod also stops polling early when too little of the tool call's time budget is left. Every request to the worker is cut off at the budget as well, so a silent worker cannot hold up Claude's turn.

## Background polling

A task that is still live after the window goes into session state. Claude gets its task id and a note: the worker is working on it, a message will come when it finishes, do not poll. Claude carries on with other work.

A timer polls every tracked task every 5 seconds. A poll that gets no answer within 15 seconds counts as failed. Tracked tasks live in session state, so the timer picks them up again when the session starts.

### The status line

While a task is live, the status line shows it. The text depends on what is going on:

| State | Status line |
| --- | --- |
| One task running | `a2a ⠋ fake slow 20 build 0:12`: the worker, the task text cut to 32 characters, and the time since it started. |
| Several running | `a2a ⠋ 2 running · 1 waiting` |
| A task waiting for your input | `a2a ? fake waiting: Which colour?` |
| Several waiting, none running | `a2a ? 2 waiting` |
| A task just ended, nothing else live | `a2a ✓ fake done 0:20` for 5 seconds. A failed task shows `✕ failed`, a canceled one `⊘ canceled`. |

The line updates once a second while anything runs. With animations off, the spinner is a still `●`.

## Waking Claude

A task is live while the worker reports `submitted` or `working`. Any other state ends tracking: `completed`, `failed`, `canceled`, `rejected`, `input-required`, `auth-required`, or a state the mod does not recognise.

When one or more tasks end, the mod submits one prompt to Claude. It starts `A2A task finished:` (or `A2A tasks finished:`) and lists each result, so Claude resumes without polling.

A task that ends in `input-required` wakes Claude too. Claude can answer by calling `send` with the same `taskId`.

## Lost contact

A task is dropped when 6 polls of it fail in a row, and Claude is told:

```text title="wake prompt"
<alias> task <id>: lost contact with the worker after 6 failed checks. Use the task tool to try again.
```

A 401 or 403 clears the cached token, so the next poll fetches a fresh one.

If you remove a worker while it has a task running, Claude is told the task is no longer tracked.

## Related

- [Commands and tools](/commands) for the `send` and `task` inputs.
- [Troubleshooting](/troubleshooting) for the messages Claude can get back.
