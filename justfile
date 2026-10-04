# show available recipes
default:
    @just --list

# install dependencies for the mod and the docs site, as CI does
[group('dev')]
install:
    pnpm install --frozen-lockfile
    pnpm -C docs/web install --frozen-lockfile --ignore-workspace

# validate the mod and type-check it
[group('dev')]
check:
    pnpm check

# run the mod's tests
[group('dev')]
test:
    pnpm test

# run the end-to-end test against the official @a2a-js/sdk server
[group('dev')]
e2e:
    pnpm e2e

# everything CI runs on a pull request
[group('dev')]
gates: check test e2e

# run the fake A2A worker
[group('dev')]
worker:
    pnpm worker

# serve the docs site with hot reload
[group('docs')]
docs-dev:
    pnpm -C docs/web dev

# build the docs site into docs/web/build/client
[group('docs')]
docs-build:
    pnpm -C docs/web build

# type-check the docs site; run after docs-build
[group('docs')]
docs-check:
    pnpm -C docs/web check

# bump, roll the changelog, run the gates, commit, tag, and push; CI publishes the release
[group('release')]
release new:
    #!/usr/bin/env bash
    set -euo pipefail
    # The ledger records decisions continuously and ships once per release, so
    # it is the one path allowed to be dirty here.
    dirty="$(git status --porcelain -- . ':(exclude).docket')"
    test -z "$dirty" || { echo "working tree is dirty outside .docket:"; echo "$dirty"; exit 1; }
    docket check
    # Before anything is written, so an empty Unreleased section costs nothing.
    node scripts/roll-changelog.ts "{{new}}" --check
    # The gates run after the bump because release.yml compares the tag with
    # plugin.json. A failing gate would leave a half-applied bump, so the trap
    # restores it. The commit below is the point of no return.
    bumped=".claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md"
    trap 'echo "release aborted; restoring $bumped" >&2; git checkout -- $bumped' ERR INT TERM
    node scripts/roll-changelog.ts "{{new}}"
    # Rewritten as JSON, not by sed: a manifest that stops parsing takes the
    # mod down. Marketplace versions are set only where the file has one, since
    # plugin.json wins over the marketplace entry.
    node -e '
      const fs = require("node:fs")
      const v = process.argv[1]
      const edit = (path, fn) => {
        const d = JSON.parse(fs.readFileSync(path, "utf8"))
        fn(d)
        fs.writeFileSync(path, JSON.stringify(d, null, 2) + "\n")
      }
      edit(".claude-plugin/plugin.json", d => { d.version = v })
      edit(".claude-plugin/marketplace.json", d => {
        if (d.metadata && "version" in d.metadata) d.metadata.version = v
        for (const p of d.plugins ?? []) if (p.name === "a2a-mod" && "version" in p) p.version = v
      })
    ' "{{new}}"
    just gates
    git add .claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md .docket
    trap - ERR INT TERM
    git commit -s -m "release: {{new}}"
    git tag -a "v{{new}}" -m "a2a-mod {{new}}"
    just publish "{{new}}"

# push the tag from `just release`; the release workflow builds the GitHub release
[group('release')]
publish new:
    #!/usr/bin/env bash
    set -euo pipefail
    # Separate from release so a failed push is one command to retry.
    git rev-parse -q --verify "refs/tags/v{{new}}" >/dev/null \
      || { echo "no tag v{{new}}; run just release {{new}} first"; exit 1; }
    have="$(node -p 'require("./.claude-plugin/plugin.json").version')"
    test "$have" = "{{new}}" \
      || { echo "plugin.json says $have, not {{new}}"; exit 1; }
    git push origin HEAD --follow-tags
    echo "pushed v{{new}}; the release workflow publishes it"
    if command -v gh >/dev/null; then
      echo "watch it with: gh run watch \$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
    fi
