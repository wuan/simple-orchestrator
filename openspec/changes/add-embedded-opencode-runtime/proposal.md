# Proposal

## Why

Running a turn today requires the operator to provision and supervise a
long-lived OpenCode server and point `OPENCODE_URL` at it. Worse, the shipped
entry point (`dist/run.js`) does not connect to one at all: its client is a stub
that throws, so a fresh deployment starts, polls, and then fails every turn with
"No agent runtime is configured". The OpenCode SDK can host OpenCode _inside_ the
orchestrator process, so the runner can start OpenCode itself with no separate
server, port, or service to manage.

## What Changes

- Add an **embedded OpenCode client** that hosts OpenCode in-process through
  `@opencode/sdk` and implements the existing `OpenCodeClient` seam, so
  orchestration is unchanged.
- Give each turn a **fresh OpenCode session** rooted at the turn workspace,
  created on the single host the process owns, and release the host when the
  service stops.
- Replace the not-wired `OpenCodeServerClient` stub in `dist/run.js` with the
  embedded client wired into `OpenCodeRuntime`.
- Raise the runtime floor to **Node.js 24**, which the SDK requires (it uses
  explicit resource management, which Node 22 cannot parse), and update CI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: the OpenCode adapter hosts OpenCode in-process instead of
  requiring an operator-managed server, creating the host once and releasing it
  on shutdown.

## Impact

- **Code**: new `src/runtime/opencode/sdk-client.ts` (host seam + client) and
  `src/runtime/opencode/sdk-host.ts` (embedded SDK adapter); rewired
  `src/run.ts`.
- **Dependencies**: adds `@opencode/sdk` (2.0.31) and its tree.
- **Runtime**: the minimum Node.js version rises from 22 to 24, including the CI
  pin.
- **Operational**: no OpenCode server process, port, or `OPENCODE_URL` to
  manage; the agent host runs inside the orchestrator process and is created on
  the first turn.
