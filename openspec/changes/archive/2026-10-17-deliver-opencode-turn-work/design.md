# Design

## Context

`WorktreeSandbox` gives each turn a throwaway `git worktree` on the workflow
branch and deletes it (and its local branch) on dispose. Two consequences fell
out of that, once a turn actually ran:

- Whatever the agent committed lived only in that worktree. Nothing pushed it,
  so the pull request branch never changed.
- The only durable record of a turn was the result object and the posted
  comment, both of which are derived from the agent's output.

Separately, the embedded host's default is a free-tier `opencode` model that is
refused outside the OpenCode client, and its default database is in-memory, so
it has neither the operator's provider auth nor the model definitions.

## Goals / Non-Goals

**Goals:**

- A failed agent turn is a failed workflow, not a silent success.
- A successful turn's commits reach the workflow branch and the pull request.
- The embedded host runs on an explicitly configured, reachable model.

**Non-Goals:**

- Extracting commit SHAs, questions, or readiness from agent prose; readiness
  stays the objective OpenSpec predicate.
- Pushing from inside the agent; the orchestrator owns publishing so
  least-privilege is enforced in one place.
- Supporting a per-turn model or a model matrix.

## Decisions

### Decision: the adapter asserts success, the engine trusts it

`createEmbeddedHostFactory().runPrompt` reads the session transcript and calls
`assertTurnSucceeded`, which throws when an assistant message has `finish:
"error"` (or an `error`) or an `idle` message reports `outcome: "failed"`. The
throw happens inside `OpenCodeRuntime.run`, so the engine's existing
`signalFailure` path marks the workflow failed and posts the provider's message.
This keeps the "agent failure" decision at the adapter boundary, where the
session shape is known, and leaves orchestration unchanged.

### Decision: the engine publishes, the provider pushes

`RepoProvider` gains `push(input)`; both GitHub cloners run
`git -C <destination> push origin <branch>` reusing the credentials they already
use to clone (`GIT_CONFIG_*` for the token transport, `GH_TOKEN`/the `gh`
credential helper for the `gh` transport), so the secret never enters argv.
`WorkflowEngine.runTurn` calls `assertPushAllowed({ branch, protectedBranches:
[baseBranch] })` and then `provider.push(...)` after the runtime returns and
before it records the phase. This finally wires the policy guard that was
present but unused, and guarantees the invariant "a turn that is recorded as
successful has been published".

Alternatives considered: having the agent push (rejected: the sandbox has no
credentials and the policy guard would be bypassed); pushing from the sandbox
(rejected: the sandbox is a git-only seam and has no host credentials).

### Decision: a configuration block, not an environment-only knob

`OrchestratorConfig` gains an `agent` block: `model` (default
`greenpt/deepseek-v4.1-flash`), optional `agent`, and optional `database`.
`createService` accepts a `runtimeFactory(config)`; `run.ts` builds the embedded
runtime from it, parsing `provider/model#variant` into the session model and
passing the database to the host. `OPENCODE_DB` is accepted as a fallback for
the database path. Configuration is the project's established seam, so this
keeps the model choice declarative and testable.

Alternatives considered: reading the model only from the environment (rejected:
inconsistent with the config file); hardcoding a model with no override
(rejected: model availability is deployment-specific).

### Decision: the database defaults to the SDK's, and operators point it at the CLI's

The embedded SDK's default database is in-memory and holds no auth or models, so
using a hosted provider requires pointing at the database the `opencode` CLI
uses (found with `opencode debug paths db`). The orchestrator does not shell out
to discover it; `agent.database`/`OPENCODE_DB` is explicit. This is documented.

## Risks / Trade-offs

- [A push now can fail a workflow that otherwise succeeded] -> intended: work
  that did not reach the branch is not a completed turn; recovery re-runs it.
- [Pushing before recording the phase can duplicate a push on retry] ->
  `git push` of an unchanged branch is a no-op, so a retry is safe.
- [The configured model may still be unavailable] -> the adapter now surfaces
  the provider's message and the workflow is marked failed, rather than
  advancing silently.
- [The default model is GreenPT-specific] -> it is a default, overridable, and
  the free-tier SDK default is unusable, so naming one is strictly better.

## Migration Plan

Operational. Existing deployments keep working (the default model applies) but
should set `agent.database` (or `OPENCODE_DB`) to reuse their provider auth.
Rollback is a revert; no persistent state changes.

## Open Questions

- Whether to attach the OpenSpec skill explicitly via `sessions.prompt`'s skills
  list, and whether the sandbox should carry the repo's `.opencode/skills`
  (currently gitignored, so absent from the clone). Left to a follow-up.
