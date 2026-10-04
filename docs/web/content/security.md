---
title: Security
description: Where worker tokens are kept, what counts as a vulnerability, and how to report one.
order: 10
section: Reference
---

Report vulnerabilities privately through a GitHub security advisory. This page also covers where your worker tokens are stored and what counts as a vulnerability.

## Reporting

Open a private security advisory at [github.com/NovusEdge/a2a-mod/security/advisories/new](https://github.com/NovusEdge/a2a-mod/security/advisories/new). Do not open a public issue.

You get an acknowledgement within 7 days and a fix or a decision within 90 days. Public disclosure waits for the fix or the 90 days, whichever comes first.

## Where worker tokens are kept

- **The `tokens` setting** is marked `sensitive`, so Claude Code keeps it out of `settings.json`. On Linux (checked on Claude Code 2.1.288) it is stored in plain text in `~/.claude/.credentials.json`, a file only your user can read, under `pluginSecrets`. Other platforms may use the system keychain; this has not been checked. Setting it with `claude plugin configure --values-stdin` replaces the whole setting, every worker's token at once.
- **`--token-cmd`** runs the command you gave as your own user, with no shell, each time the cached token is older than 5 minutes or a worker answers 401 or 403. Only give it a command you trust. The command line is stored and shown; its output is not.
- **`--token-file`** reads the file as your own user. Claude Code does not report file permissions to the mod, so it cannot warn you about a file other users can read. Keep it at mode 0600.
- Command and file tokens are held in the mod's memory for up to 5 minutes. They are never written to the mod's store.

## Workers Claude adds

Claude can add or remove a worker with the `add_worker` and `remove_worker` tools, but only after you approve a dialog. The dialog shows on every call, whatever the permission mode. In a run with no one to ask, such as `claude -p`, the tools refuse.

A worker Claude adds gets its token only from the `tokens` setting, or none. Token commands, token files and `--trust-endpoint` stay in `/a2a add`, which only you type. A worker's reply reaches Claude like any tool result and can carry prompt injection, so Claude has no way to set those.

## What counts

- A worker token written to the transcript, a tool result, a status line, a log, or any file other than the mod's own store.
- The mod sending a request to a host the user did not register, including through a redirect or a URL taken from an Agent Card.
- A worker token sent to a host other than the one it was registered for.
- A worker response that makes the mod run a tool, a command, or a process without the model asking for it.
- Any way to give the mod a worker token other than the `tokens` setting, `--token-cmd` or `--token-file`.
- A way for Claude, or a worker's reply, to add a worker with a command token, a file token or a trusted endpoint, or to add or remove a worker without the dialog.
- The output of a `--token-cmd` command, or a token file's contents, appearing in any text the mod emits.

## What does not count

- Prompt injection through a worker's reply. A worker's output reaches the model as a tool result, the same as a web page fetched by WebFetch. Register only workers you trust.
- A registered worker misbehaving. The worker runs outside this project's control.
- Anything a mod can do by design: mods run with the user's permissions and are not sandboxed.
- A token the user typed into a prompt themselves.

[Worker tokens](/tokens) explains how to set each source up.
