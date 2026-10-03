# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tools for Claude: `mcp__a2a-mod__workers` lists registered workers and their skills, `mcp__a2a-mod__send` sends a task, and `mcp__a2a-mod__task` reads or cancels one.
- `/a2a add <url> [alias]`, `/a2a list` and `/a2a remove <alias>` to manage workers. `/a2a list` also shows running tasks and their age.
- A2A protocol 1.0 and 0.3 over the JSON-RPC binding. The version comes from the Agent Card.
- Background tracking: a task that does not finish within about 7 seconds is polled every 5 seconds, and Claude gets a message when it finishes. A worker that fails 6 polls in a row is dropped, and Claude is told. The status line shows `a2a: N running`.
- Bearer tokens for workers, from one of three sources per worker: the sensitive `tokens` plugin setting (a JSON object of alias to token, the default), `--token-cmd "<command>"` (run without a shell; stdout is the token), or `--token-file <path>`. Command and file tokens are cached for 5 minutes and fetched again after a 401 or 403. A token is never typed into `/a2a`, and every text the mod emits has it replaced with `[token]`.
- The origin rule: a token is not sent to an endpoint on another origin than the worker's card unless the worker was added with `--trust-endpoint`.
