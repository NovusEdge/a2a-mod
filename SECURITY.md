# Security

## Reporting

Open a private security advisory at https://github.com/NovusEdge/a2a-mod/security/advisories/new. Do not open a public issue.

You get an acknowledgement within 7 days and a fix or a decision within 90 days. Public disclosure waits for the fix or the 90 days, whichever comes first.

## What counts

- A worker token written to the transcript, a tool result, a status line, a log, or any file other than the plugin's own store.
- The mod sending a request to a host the user did not register, including through a redirect or a URL taken from an Agent Card.
- A worker token sent to a host other than the one it was registered for.
- A worker response that makes the mod run a tool, a command, or a process without the model asking for it.

## What does not count

- Prompt injection through a worker's reply. A worker's output reaches the model as a tool result, the same as a web page fetched by WebFetch. Register only workers you trust.
- A registered worker misbehaving. The worker runs outside this project's control.
- Anything a mod can do by design: mods run with the user's permissions and are not sandboxed.
