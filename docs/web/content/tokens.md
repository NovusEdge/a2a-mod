---
title: Worker tokens
description: A worker gets a bearer token from one of three sources, chosen per worker when you add it.
order: 5
section: Use
---

Most real workers want a bearer token. You never paste it into Claude. When you add the worker, you tell the mod which of three places to read it from.

## Three sources

Pick the source when you run `/a2a add`. With no flag, the mod uses the `tokens` setting. Give a worker at most one token flag.

| Flag | Source | Notes |
| --- | --- | --- |
| `--token-setting` | The `tokens` setting | The default. `alias=token` pairs separated by spaces. |
| `--token-cmd "<command>"` | A command's output | Run without a shell. Cached for 5 minutes. |
| `--token-file <path>` | A file | Keep it at mode 0600. Cached for 5 minutes. |

## The tokens setting

The setting holds `alias=token` pairs separated by spaces. The mod looks up a worker's token by its alias. Set the setting from a shell, then restart Claude Code:

```sh title="shell"
claude plugin configure a2a-mod@a2a-mod --values-stdin <<< '{"tokens":"w1=<token>"}'
```

This replaces the whole setting, so list every worker in it: `"w1=<token> w2=<token>"`.

If the mod's id is not `a2a-mod@a2a-mod`, use the id that `claude plugin list` shows.

If any word in the setting is not `alias=token`, the mod ignores the whole setting, and `/a2a list` prints a warning.

## Command and file

`--token-cmd` runs a command without a shell and uses its output as the token. The mod splits the command on spaces; wrap an argument in double quotes to keep it as one word.

```text title="claude code"
/a2a add https://worker.example.com w1 --token-cmd "op read op://vault/w1/token"
/a2a add https://worker.example.com w2 --token-cmd "pass show w2"
/a2a add https://worker.example.com w3 --token-cmd "gh auth token"
```

`--token-file` reads the token from a file. Keep it at mode 0600:

```text title="claude code"
/a2a add https://worker.example.com w4 --token-file ~/.config/a2a/w4.token
```

Command and file tokens are cached in memory for 5 minutes. The mod fetches them again after a 401 or 403 from the worker.

The command line is stored and shown by `/a2a list`. Its output is never shown. The mod gives the command 10 seconds to finish.

## Workers Claude adds

A worker that Claude adds with the `add_worker` tool uses the `tokens` setting and nothing else. If the card asks for a token and the setting has none for that alias, Claude tells you how to set it. For a command or file token, or for `--trust-endpoint`, run `/a2a add` yourself. A worker's reply can carry prompt injection, so Claude is never given a way to choose where a token comes from.

## Where a token goes

A token goes only to the origin of the worker's Agent Card. If the card points to an endpoint on another origin, the mod withholds the token until you re-add the worker with `--trust-endpoint`. That flag allows the token to go to an endpoint on another origin than the card, and it is separate from the three sources.

## Never type a token

> **Never type a token into Claude or into `/a2a`.** Slash commands are kept in the transcript, so `/a2a add` rejects `--token`.

For where each source is kept and what counts as a vulnerability, see [Security](/security).
