---
title: Troubleshooting
description: Each message the mod prints, what it means, and what to do about it.
order: 7
section: Use
---

Find the message you got and read the fix. Most errors start with `a2a:`, which the tables leave out. A few do not: the notices about unknown workers, the warning from `/a2a list`, the notes after `add`, and the background-task messages. Text in angle brackets, like `<alias>`, stands for a value.

## Adding a worker

| Message | What to do |
| --- | --- |
| `fetching the Agent Card at <url> failed with HTTP <status>` | Open the URL in a browser or with curl. Check the address and that the worker is running. |
| `<url> did not return JSON` | The URL is not an Agent Card. Use the worker's base URL, or the full URL of its card. |
| `that URL did not return an A2A Agent Card` | The JSON has no `name`. Check that the address points at an A2A worker. |
| `the card lists no JSON-RPC endpoint; a2a-mod only speaks the JSON-RPC binding` | The worker offers only gRPC or REST. The mod cannot use it. See [Protocol](/protocol). |
| `--token is not accepted, because slash commands are kept in the transcript. ...` | Use the `tokens` setting, `--token-cmd` or `--token-file`. See [Worker tokens](/tokens). |
| `--token-cmd needs a value.` or `--token-file needs a value.` | Put the command or path right after the flag. |
| `--token-cmd needs a command.` | The command was empty. |
| `give a worker one of --token-setting, --token-cmd or --token-file, not several.` | Keep one token flag. |
| `unknown option <option>.` | Check the spelling. The usage text follows the message. |
| `a double quote is not closed` | Close the quote around the command. |

After a successful `add`, the mod can add a note:

| Note | What to do |
| --- | --- |
| `<alias>'s card asks for authentication, and the tokens setting has no token for it yet.` | The note prints the command to set the token. Run it from a shell and restart Claude Code. |
| `Its endpoint (<origin>) is on another origin from its card, so the token is not sent until you re-add it with --trust-endpoint.` | If you expect the endpoint to be there, add the worker again with `--trust-endpoint`. |

`/a2a list` can print `Warning: the tokens setting is not valid (it should be alias=token pairs separated by spaces), so no worker gets a token from it.` Fix the setting. Every word must be `alias=token`.

## Getting a token

| Message | What to do |
| --- | --- |
| `could not read the token file <path> for worker <alias>` | Check that the path exists and your user can read it. |
| `the token file <path> for worker <alias> is empty` | Write the token into the file. |
| `the token command for worker <alias> could not run (<command>)` | Check that the program is installed and on your path. The mod runs it without a shell. |
| `the token command for worker <alias> failed with exit code <n> (<command>)` | Run the command yourself and fix what it reports. |
| `the token command for worker <alias> printed nothing (<command>)` | The command must print the token on standard output. |

The mod never puts a command's output into a message, because on failure it may be the token.

## Talking to a worker

Claude sees these in the tool result.

| Message | What to do |
| --- | --- |
| `worker <alias> refused the request (HTTP 401); its token is wrong or expired.` (or `missing`, or HTTP 403) | Check the worker's token source. `/a2a list` shows it. Fix the token; the cached copy is dropped on this error. |
| `worker <alias>'s endpoint <origin> is on a different origin from its card, so its token is not sent there. ...` | If that is expected, re-add the worker with `--trust-endpoint`. |
| `could not reach worker <alias> at <origin>: ...` | The worker is down or the network is blocked. Check it and try again. |
| `worker <alias> answered HTTP <status>` | The worker failed the request. Check its logs. |
| `worker <alias> returned error <code>: <message>` | The worker rejected the request. The message comes from the worker. |
| `worker <alias> did not return JSON` or `worker <alias> returned no result` | The endpoint is not speaking JSON-RPC as the card says. Check the worker. |
| `worker <alias> did not answer within <n> s. Try again later, or ask the user to check it.` | The worker was too slow for the tool call's time budget. Try again later. |
| `No worker named <alias>. Known workers: ...` | Use one of the listed aliases. |
| `No workers registered. Ask the user to run /a2a add <url>.` | Run `/a2a add <url>`. |

If a worker's reply is longer than the tool shows, it ends with `[truncated <n> characters; call the task tool for the full result]`. Ask Claude to call `task` for the rest.

## Background tasks

These arrive in the wake-up prompt.

| Message | What to do |
| --- | --- |
| `<alias> task <id>: lost contact with the worker after 6 failed checks. Use the task tool to try again.` | Check the worker. When it is back, ask Claude to read the task with `task`. |
| `<alias> task <id>: the worker was removed, so it is no longer tracked.` | Add the worker again with `/a2a add` if you still need the task. |
