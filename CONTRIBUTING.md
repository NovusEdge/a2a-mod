# Contributing to a2a-dispatch

## Setup

```sh
pnpm install
pnpm check   # type-check and `claude plugin validate --strict`
pnpm test    # `claude plugin test` plus the end-to-end run against the fake worker
```

You need Node 24, pnpm, and Claude Code 2.1.287 or later (the first release with mods). To run the mod in a live session from your clone:

```sh
claude --plugin-dir .
```

The session watches the folder and reloads the mod when you save a file.

## Branches and pull requests

- Branch off `main`. One change per branch.
- Every PR is squash merged. The PR title becomes the commit subject, so write it in the commit grammar below.
- Sign off every commit (`git commit -s`). The DCO check reads the `Signed-off-by` trailer and blocks a merge without it.
- No `Co-Authored-By` or tool-attribution trailers.

## Commit grammar

`type(scope): imperative subject`, under 60 characters.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`. Scope is the area: `client`, `tools`, `poll`, `ui`, `worker`, `release`.

The body says what changed and why. It does not narrate how the answer was found.

## Gates

CI runs `pnpm check` and `pnpm test` on every PR. A PR that changes what goes over the wire also runs the end-to-end test against the official `@a2a-js/sdk` server, so the client stays honest against the reference implementation and not only against its own mocks.

## Design changes

A new tool, a change to a tool's input schema, or a change to what the mod sends a worker starts as an issue that states the design. Tool schemas are what the model reads, so a careless change costs every user context tokens or breaks prompts that worked.

Decisions are recorded with [docket](https://github.com/NovusEdge/docket) in `.docket/`. Commit the ledger with the change it describes.

## Comments

A comment in code carries a fact the reader cannot get from the code. Paraphrase, investigation history, and section banners are deleted in review.

## Reporting a security issue

Open a private security advisory on the GitHub repository. Do not open a public issue for it. See [SECURITY.md](SECURITY.md).
