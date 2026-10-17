# Proposal

## Why

Exercising the embedded OpenCode runtime end to end exposed three gaps that
together made a turn look successful while producing nothing:

- The adapter treated an errored turn as a success. When the agent's model call
  failed (provider auth, model unavailable, ...), the SDK reported
  `finish: "error"` and a failed session, but the adapter returned an empty
  summary. The orchestrator then evaluated readiness (not ready) and moved the
  pull request to `openspec:proposing` with no work and no failure signal.
- Nothing published the turn's commits. A turn commits inside a throwaway git
  worktree that is removed when the turn ends, and no code pushed the branch, so
  even a successful turn never reached the pull request.
- The embedded host ran on the SDK's default free-tier model, which refuses
  non-CLI clients, because the orchestrator never chose a model or pointed the
  host at the operator's provider auth.

## What Changes

- **Fail the turn when the agent errors.** The adapter inspects the session and
  throws on an errored assistant message or a failed session, so the workflow is
  marked failed with the provider's message.
- **Publish the workflow branch after each turn.** The provider gains a `push`
  operation; the engine pushes only the workflow branch (least-privilege,
  enforced through the existing policy guard) before recording the next phase.
  A failed push fails the workflow.
- **Configure the embedded host.** A new `agent` configuration block selects the
  model (default `greenpt/deepseek-v4.1-flash`), an optional agent, and the
  OpenCode database that holds provider auth and models (`OPENCODE_DB` also
  accepted).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: the OpenCode adapter is configured with a model and database
  and fails the turn on agent error; the orchestrator (not the agent) publishes
  the workflow branch.
- `repo-provider`: the provider interface gains a push operation.
- `workflow-orchestration`: a successful turn's commits are published before the
  workflow advances, and a publish failure fails the workflow.
- `orchestrator-configuration`: the agent model, agent, and database are
  configurable with a documented default model.

## Impact

- **Code**: `src/runtime/opencode/sdk-host.ts` and `sdk-client.ts` (failure
  surfacing, model/database, model parsing), `src/provider/` (push), 
  `src/orchestrator/engine.ts` (publish after a turn), `src/config/` (agent
  block), `src/service.ts` and `src/run.ts` (wire the configured runtime).
- **Operational**: operators set `agent.database` (or `OPENCODE_DB`) to reuse the
  `opencode` CLI's provider auth, and may override `agent.model`.
- **Dependencies**: none new.
