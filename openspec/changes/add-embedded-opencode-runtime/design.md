# Design

## Context

The runtime seam is already narrow: `OpenCodeRuntime`
(`src/runtime/opencode/opencode-runtime.ts`) depends only on `OpenCodeClient`
(`src/runtime/opencode/client.ts`), which has a single `runSkill` method. The
only place a concrete client is chosen is `src/run.ts`, whose
`OpenCodeServerClient` is a stub that throws and hardcodes
`http://localhost:4096`. Everything else — polling, decisions, the sandbox,
readiness — is independent of how OpenCode runs.

Two facts shape the design:

- The embedded SDK (`@opencode/sdk` 2.0.31) assembles OpenCode's server and
  routes API calls through its HTTP router in memory. It opens no listener and
  needs no external process. Under Node 24.22 `OpenCode.create()` succeeds and
  exposes `sessions.create`, `sessions.prompt`, `sessions.wait`,
  `sessions.context`, `events.subscribe`, and `close`.
- The SDK's dependency tree uses explicit resource management (`await using`),
  which the repository's current Node 22 (V8 12.4) cannot parse even with the
  experimental V8 flag. Node 24 parses it natively.

## Goals / Non-Goals

**Goals:**

- Run real turns with no operator-managed OpenCode server, port, or URL.
- Keep the change behind `OpenCodeClient`; leave orchestration untouched.
- Make the adapter unit-testable without the SDK, network, or a model.
- Release host resources so both `--once` and long-running modes exit cleanly.

**Non-Goals:**

- Changing the turn prompt, the readiness gate, or the `TurnResult` contract.
- Synthesizing structured fields (commit SHAs, questions, readiness) the agent
  does not emit; the adapter reports the agent's final text as the summary and
  leaves the unextracted fields empty. Readiness remains the objective OpenSpec
  predicate, never agent prose.
- Supporting concurrent turns on one host; the engine is sequential.
- Bundling or transpiling the SDK to keep Node 22.

## Decisions

### Decision: embed the SDK, not a managed service or a per-turn CLI

Three ways to "start OpenCode from the runner" were considered:

- **Embedded SDK (`@opencode/sdk`)** — chosen. Hosts OpenCode in-process, no
  listener, no external process; the SDK's `sessions` API maps directly onto the
  runtime's per-turn needs and takes an `AbortSignal`.
- **Managed background service (`@opencode/client` + `Service.ensure()`)** —
  works on Node 22 and still avoids an operator-managed server, but keeps a
  separate process and an HTTP hop, and leaves the Node floor unchanged.
- **Spawn `opencode run` per turn** — no library and Node-22 friendly, but the
  result is parsed from CLI text and the typed usage/abort APIs are lost.

The embedded host is the truest reading of "start OpenCode from the runner" and
the smallest conceptual surface, at the cost of a Node 24 floor.

### Decision: a structural `OpenCodeHost` seam, SDK imported lazily

`OpenCodeClient` gains an implementation, `EmbeddedOpenCodeClient`, that depends
on a tiny `OpenCodeHost` interface (`createSession`, `runPrompt`, `close`)
rather than on the SDK's generated types. The real adapter in `sdk-host.ts`
imports `@opencode/sdk` dynamically and casts it to a small local interface, so:

- the orchestrator's build and its tests never load the SDK;
- tests inject a fake host (and a fake SDK loader) and cover all mapping;
- the adapter is insulated from the SDK's very large generated type surface.

Alternatives considered: importing the SDK types directly (rejected: couples the
build to a moving generated surface for a handful of calls); instance-per-turn
hosts (rejected: `OpenCode.create()` assembles the server and plugins and is
meant to be long-lived — the README says hold one host per owner).

### Decision: one host per process, one session per turn

The client memoizes the first `createHost()` call and reuses the host for the
life of the process, mirroring the SDK guidance. Each `runSkill` creates a fresh
session rooted at `request.workspace`, so turns stay isolated exactly as the
`Ephemeral sandbox per turn` requirement demands. `dispose()` closes the host so
the SDK releases its fibers and the process can exit (important for `--once`).

### Decision: prompt, wait, then read the transcript

`runPrompt` sends the turn prompt, waits for the session to become idle, then
reads `session.context` and returns the concatenated text of the last assistant
message. The `AbortSignal` from the per-turn limits is passed to `prompt` and
`wait`, so a stopped turn stops the host.

Alternatives considered: subscribing to `events` and assembling the message
stream (rejected for now: more moving parts for the same text); treating the
`prompt` return value as the answer (rejected: it is the admitted user inbox
item, returned before the assistant finishes).

### Decision: raise the runtime floor to Node 24

The SDK cannot be imported on Node 22. Bundling/transpiling the SDK was
rejected as adding build machinery and risk for native/dynamic dependencies.
Bumping `engines.node` and the CI pin is a one-line, honest change; deployments
move to Node 24.

## Risks / Trade-offs

- [Node 24 is a hard floor] -> documented in `package.json`, CI, and the README;
  the alternative (bundling the SDK) was judged riskier.
- [The SDK's host keeps the event loop alive] -> `run()` disposes the client in
  a `finally`, so `--once` exits and a signalled shutdown releases resources.
- [Structured turn fields are not extracted] -> `summary` carries the agent's
  final text; `commits`, `questions`, and flags stay empty. The gate is
  objective, so correctness does not depend on them; a structured reporting
  channel is a follow-up.
- [A real model/credentials are needed to exercise turns] -> unit tests inject a
  fake host and a fake SDK; the embedded host itself is checked by loading it
  under Node 24.

## Migration Plan

Operational. Deployments move to Node 24 and stop provisioning an OpenCode
server or setting `OPENCODE_URL`; the orchestrator starts OpenCode inside its own
process. Rollback: revert to the prior commit and the previous server-based
wiring; no persistent state is involved.

## Open Questions

- Whether to attach the OpenSpec skill explicitly (`sessions.prompt` accepts a
  `skills` list) versus relying on the prompt text and skill discovery. Left to a
  follow-up once a live turn is exercised.
- Whether the embedded host should auto-approve tool permissions. A turn runs in
  a throwaway sandbox, but the default permission behaviour may ask and stall
  with no user attached. `EmbedOpenCodeOptions.create` already passes arbitrary
  `OpenCode.create` options (model, agents, permissions) through, so a
  deployment can configure this; a sensible default should be chosen once a live
  turn is exercised.
