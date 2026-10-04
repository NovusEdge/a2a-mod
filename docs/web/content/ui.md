---
title: The UI
description: The status line, the hand-off band, the workers pane and the transcript cards, and what each layout shows.
order: 9
section: Reference
---

## What you see

| Piece | `full` (default) | `pane` | `minimal` |
| --- | :-: | :-: | :-: |
| Status line with the live task | yes | yes | yes |
| Workers pane, opened with `/a2a` | yes | yes | no |
| Cards for `send` and for wake messages | yes | no | no |
| Hand-off band above the prompt | yes | no | no |

Change the layout or turn animations off in `/config`. With animations off, every effect draws one still frame. VS Code and the mobile app draw still frames, and the mobile app has no Reply button. Built and tested on Claude Code 2.1.288.

## The status line

The status line is where a running task shows. It stays visible while `/diff` is open, which a pane does not.

| State | Reads |
| --- | --- |
| One task running | `a2a ⠋ fake slow 20 build 0:12` |
| Several running | `a2a ⠋ 2 running · 1 waiting` |
| A worker asked a question | `a2a ? fake waiting: which colour` |
| Several asked | `a2a ? 2 waiting` |
| Just finished, nothing else live | `a2a ✓ fake done 0:20`, gone after 5 seconds |

The task text is cut to 32 characters. The line updates once a second while a task runs, so the time ticks and the spinner steps; with animations off the spinner is a still `●`.

## The band

One row above the prompt, only while a task runs or waits: `Claude ┄●┄ fake`, with a packet going out when you send and coming back when the result lands. A chip per running or waiting task follows. The band goes about 2 seconds after the last task ends. It shares the slot with other mods and yields to surveys.

## The workers pane

Run `/a2a` to open it. It never opens on its own, so a running task does not switch the dock away from `/diff`. In a fullscreen terminal it docks beside the transcript, 32 columns wide, as a tab next to `/diff`. Otherwise it is a short block above the prompt. It does not take the keyboard until you move into it.

It is drawn for narrow widths and holds down to 24 columns:

- A header, `⇄ a2a`, with the number of workers and live tasks at the right.
- One rounded box per worker, with its A2A version at the right and its tasks inside. A running task has an animated row with its age and a progress bar. Buttons sit at the right edge of each task: Cancel, Open (the full result, with Copy) and Reply for a worker that asked a question.
- A footer with `/a2a add <url>` and the key hints, kept at the bottom of the pane. The key hints go below 28 columns.

From 40 columns up, each worker box also shows its skills and the run times of its last tasks. With no workers, the pane says how to add one.

## The transcript cards

Each `send` shows as a card in the transcript: a rounded box, indented two columns, up to 100 columns wide.

- The header has the worker, and its A2A version and organization at the right.
- The message is wrapped under a dim `│` bar. While the task runs, a live row shows its age.
- The result is a box with a badge: `● tracked`, `✓ completed`, `? needs input` or `✕ failed`. A completed result types itself in once. A task still running reads `tracked · task 5954ae32 · you'll be told when it lands`.

The message that wakes Claude when a tracked task finishes gets the same kind of box, with the badge at the right of the header. Press ctrl+o to see the raw message.

Worker text is shown with terminal control characters removed, and a token never appears in any of it. [How it works](/how-it-works) has the rest.
