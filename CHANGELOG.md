# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The status line shows the live task: `a2a ⠋ fake slow 20 build 0:12`. With several tasks it reads `a2a ⠋ 2 running · 1 waiting`; a task that asks a question reads `a2a ? fake waiting: <question>`; a task that just ended shows `a2a ✓ fake done 0:20` for 5 seconds. It updates once a second while a task runs.
- The hand-off band above the prompt draws only while a task runs or waits, plus the 2-second return packet after the last one ends. It no longer lingers for 10 minutes, and its chips no longer show elapsed time.
- The workers pane opens only when you run `/a2a`, never on its own, so a running task no longer switches the dock away from `/diff`. It asks for a slim dock (32 columns) or a short block (12 rows) and does not take the keyboard.
- The workers pane is redrawn for that width, and holds down to 24 columns: a header (`⇄ a2a` and a count of workers and live tasks), one rounded box per worker with its tasks inside, and a footer with the key hints pinned to the bottom. Rows run the full width, with times, versions and buttons at the right edge. The empty pane is centred.
- The transcript cards for `send` and for wake messages are rounded boxes, indented two columns and as wide as the transcript allows (up to 100). The worker is in the header with its version and organization at the right; the message is wrapped under a quote bar; the result has a coloured badge (`● tracked`, `✓ completed`, `? needs input`, `✕ failed`) and an indented body. A tracked task reads `tracked · task 5954ae32 · you'll be told when it lands` instead of the text written for Claude.

## [0.1.0] - 2026-10-04

### Added

- Tools for Claude: `mcp__a2a-mod__workers` lists registered workers and their skills, `mcp__a2a-mod__send` sends a task, and `mcp__a2a-mod__task` reads or cancels one.
- `/a2a add <url> [alias]`, `/a2a list` and `/a2a remove <alias>` to manage workers. `/a2a list` also shows running tasks and their age.
- A2A protocol 1.0 and 0.3 over the JSON-RPC binding. The version comes from the Agent Card.
- Background tracking: a task that does not finish within about 7 seconds is polled every 5 seconds, and Claude gets a message when it finishes. A worker that fails 6 polls in a row is dropped, and Claude is told. The status line shows `a2a: N running`.
- A workers pane (`/a2a` with no arguments opens it). It lists each worker's version, skills and recent run times, and its tasks from the last 10 minutes. Running tasks have an animated row with elapsed time and a progress bar. Buttons: Cancel, Open (the full result, with Copy; one result open at a time), and Reply for a worker that asked a question. The pane opens on its own when a task is tracked, if the terminal is wide enough.
- Cards for the `send` tool in the transcript: the worker, its A2A version and organization, the message, a live row while it runs, and a state badge on the result. A completed result types itself in once.
- A card for each task in the message that wakes Claude. Press ctrl+o to see the raw message.
- A hand-off band above the prompt while tasks run or finished in the last 10 minutes: `Claude ┄●┄ worker` with a packet going out and coming back, and a chip per running or waiting task. It shares the band with other mods and yields to surveys.
- `layout` setting in `/config`: `full` (default), `pane` (the workers pane only) or `minimal` (the status line only). `animations` setting: off draws every effect as one still frame.
- Bearer tokens for workers, from one of three sources per worker: the sensitive `tokens` setting (`alias=token` pairs separated by spaces, the default; `/a2a add` prints the command to set it only for workers whose card asks for authentication), `--token-cmd "<command>"` (run without a shell; stdout is the token), or `--token-file <path>`. Command and file tokens are cached for 5 minutes and fetched again after a 401 or 403. A token is never typed into `/a2a`, and every text the mod emits has it replaced with `[token]`.
- The origin rule: a token is not sent to an endpoint on another origin than the worker's card unless the worker was added with `--trust-endpoint`.

### Changed

- `/a2a` with no arguments opens the workers pane, and still prints the usage text.
- A task that asks a question stays listed as waiting until someone answers it, and the status line adds `· N waiting`.
- Worker text shown in the UI has terminal control characters removed (ANSI colour codes, bells).

