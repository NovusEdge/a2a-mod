---
title: Overview
description: Claude hands tasks to non-Claude agents over A2A, keeps working, and picks up the results when they land.
order: 1
section: Start
---

## What it does

a2a-mod is a Claude Code mod. It lets Claude send tasks to other agents over the Agent2Agent (A2A) protocol. Any A2A 1.0 or 0.3 worker can take the job: ADK, AG2, LangGraph, @a2a-js/sdk and others.

Claude drives and the worker does the hands-on work. A slow task never blocks Claude. If the worker has not finished after a few seconds, the mod tracks the task in the background and hands Claude a task id. When the task finishes, the mod wakes Claude with the result.

## Install

In Claude Code:

```text title="claude code"
/plugin marketplace add NovusEdge/a2a-mod
/plugin install a2a-mod@a2a-mod
```

This needs Claude Code 2.1.287 or later, the first release with mods.

## Where to go next

- [Quick start](/quick-start) runs the repo's fake worker, so you can try the mod without a real agent.
- [Commands and tools](/commands) covers `/a2a` and the three tools Claude sees.
- [Worker tokens](/tokens) explains how a worker gets its bearer token.
- [How it works](/how-it-works) follows a task from `send` to the wake-up.
- [Troubleshooting](/troubleshooting) lists the messages the mod prints and what to do about each.
