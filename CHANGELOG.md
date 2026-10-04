# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The message that wakes Claude shows as one short line (`a2a: fake task … completed`); the full result goes to Claude without filling the transcript. Claude Code never drew the wake card, so the old message showed as the engine's raw framed text.
- The `send` result now tells Claude what the wake line looks like, that it comes from the mod and not the user, and to call `task` if it carries no result.

## [0.3.0] - 2026-10-04

### Added

- `add_worker` and `remove_worker` tools: Claude can register and forget a worker. Each call opens a dialog the user answers, in every permission mode; Cancel, a dismissed dialog or a `-p` run changes nothing. A tool-added worker uses the `tokens` setting only. Token commands, token files and `--trust-endpoint` stay in the user's own `/a2a add`.

### Security

- `add_worker` refuses to refresh a worker whose card or endpoint is on a different origin from the stored one, and to give a new worker an alias that already has a token in the `tokens` setting. Both need the user's own `/a2a add`. Before, a refresh could point a worker with a stored token at another host.
- `add_worker` refreshes an existing alias only from the exact card URL it was stored with. Before, another path on the same host passed the origin check, so on a shared host one tenant could take over another's alias.
- `add_worker` never cuts the endpoint origin in the dialog and refuses one over 100 characters. The dialog's Authentication line says whether a token would really be sent.
- Aliases such as `constructor` or `toString` no longer match members of `Object.prototype` in the worker and token lookups; `__proto__` is refused as an alias.
- `add_worker` tells Claude only "Could not read an Agent Card at that URL." when the fetch fails, so it cannot probe addresses through the HTTP status. `/a2a add` keeps the detail.
- Unicode format characters (bidi overrides, zero-width spaces) are stripped from the dialog and from worker text shown to Claude and the user. Zero-width joiners stay in worker text.

### Fixed

- `/a2a remove` now also drops the worker's run-time history, so a worker added again under the same alias starts without the old averages.
- A task's wake message draws as the boxed wake card again. It was skipped whenever Claude Code reported the row as expanded, and when the engine wrapped the text in its "plugin sent a message" framing.
- The "needs input" result card shows the worker's question and `task <id> · reply in the a2a pane`, not the summary line written for Claude. Completed and failed cards likewise show only the result or the error.
- The status line no longer starts with `a2a`: Claude Code already prefixes the mod's name, so it read `a2a-mod: a2a ⠋ …`.
- In the workers pane, `Clear done` sits on its own right-aligned row under the rule instead of running into the worker count.

## [0.2.0] - 2026-10-04

### Changed

- The status line shows the live task: `a2a ⠋ fake slow 20 build 0:12`. With several tasks it reads `a2a ⠋ 2 running · 1 waiting`; a task that asks a question reads `a2a ? fake waiting: <question>`; a task that just ended shows `a2a ✓ fake done 0:20` for 5 seconds. It updates once a second while a task runs.
- The hand-off band above the prompt draws only while a task runs or waits, plus the 2-second return packet after the last one ends. It no longer lingers for 10 minutes, and its chips no longer show elapsed time.
- The workers pane opens only when you run `/a2a`, never on its own, so a running task no longer switches the dock away from `/diff`. It asks for a slim dock (32 columns) or a short block (12 rows) and does not take the keyboard.
- The workers pane is redrawn for that width, and holds down to 24 columns: a header (`⇄ a2a` and a count of workers and live tasks), one rounded box per worker with its tasks inside, and a footer with the key hints pinned to the bottom. Rows run the full width, with times and versions at the right edge. The empty pane is centred.
- The transcript cards for `send` and for wake messages are rounded boxes, indented two columns and as wide as the transcript allows (up to 100). The worker is in the header with its version and organization at the right; the message is wrapped under a quote bar; the result has a coloured badge (`● tracked`, `✓ completed`, `? needs input`, `✕ failed`) and an indented body. A tracked task reads `tracked · task 5954ae32 · you'll be told when it lands` instead of the text written for Claude.

- The workers pane starts with an agent tree: `Claude` and a branch per worker with its task counts by state (`● 1  ? 1  ✓ 4`). Pressing a branch folds or opens that worker's box, which shows `▾` or `▸` in its title.
- A worker box lists three tasks, running and waiting first. `+N more` lists them all and `show less` goes back. Fold state and the list size are kept for the session.
- A task row is one line and the line is the button. Pressing it opens the task (one at a time) with its result, question or latest status message, then only the actions its state allows in one row: Copy, Reply, Cancel. A waiting row ends with a violet `reply ↵`. The Cancel, Open and Reply buttons at the edge of every row are gone.
- `Clear done` in the pane header hides finished tasks from the pane. The transcript cards keep them.
- The running row's glyph and shimmer no longer animate; its bar and elapsed time do, on the line under the task.

### Fixed

- A task whose send was cut short by a reload no longer leaves the status line spinning: on reload a running task nobody tracks is tracked again, or marked removed when its worker is gone.
- The empty pane, the header and the transcript cards are cut to the width they are given, down to 10 columns.
- The status line says `failed` for a rejected task, as the result card does.
- A `send` result card reads `✓ completed` (or the state it reached) once the task lands, instead of staying on `tracked`.
- The band is described as a wire line with a row of chips, not one row.

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

