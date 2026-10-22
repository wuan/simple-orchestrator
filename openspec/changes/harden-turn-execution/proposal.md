# Proposal

## Why

A controlled reproduction of the failed apply turn on
[`wuan/bo-android#488`](https://github.com/wuan/bo-android/pull/488) showed the
apply turn ended after 216 s having committed nothing, so the orchestrator marked
the workflow failed with `the apply turn produced no change`. Re-running the same
turn in the same image succeeded (`c4d35d80`, implementation plus archive) but
took 870 s, because the environment paid the full cold-toolchain cost: it
downloaded Gradle 9.6.0 and Android build-tools/platform, then compiled, tested,
and linted. Three defects made that outcome opaque and repeatable:

1. **Cache volumes are never writable.** `environment.caches` mounts named
   volumes, but a named volume is created root-owned and the container runs as
   the orchestrator's uid. When the image does not pre-create the mount path -
   the `android` flavour does not - the turn cannot write the cache. The
   reproduction confirmed `mkdir /tmp/.gradle/probe` fails with `Permission
   denied`, the agent fell back to an ephemeral home, and the volume stayed
   empty. Every turn therefore re-downloads the toolchain, which is exactly the
   "cold tool caches make Android turns slow or fail" risk the containerized
   environments design called out. The `rust` flavour only avoids this because
   its Dockerfile seeds `/usr/local/cargo` as world-writable.

2. **Per-turn limits are not enforced.** The `agent-runtime` spec requires the
   orchestrator to bound each turn by steps, tokens, and wall-clock time and to
   fail a turn that exceeds a limit, but `LimitedRuntime`/`TurnLimiter` are never
   wired into the service. The deploy unit's comment that "turns are capped by
   `limits.maxDurationMs`" is therefore not true. The token budget also has to be
   defined before it can be enforced: a real turn reports millions of tokens
   almost entirely as cache reads, so a naive total-token cap would fail every
   turn.

3. **A failed turn hides its own account of the failure.** When a turn finishes
   without committing, the engine raises `NoProgressError` and posts only that
   message; the turn's summary and questions - the only place the agent explains
   what it did or why it stopped - are discarded. The earlier recovery turn could
   only guess "it may have run out of time".

## What Changes

- Make every mounted cache volume writable by the turn user before the turn runs,
  by preparing each scoped volume once per process with a short root `chown`
  over the mounted path. Preparation is best-effort: an image that cannot run it
  still turns, it just does not get a warm cache.
- Enforce the configured per-turn limits by wrapping the service's runtime in
  the existing `LimitedRuntime`, and define the token budget as the tokens of new
  work - input, output, reasoning, and cache write - excluding cache reads, so
  the documented default (`maxTokens: 200000`) bounds work rather than the
  context an agent re-reads.
- Post the turn's summary and questions in the failure comment when a turn
  produces no change, so the failure explains itself on the pull request.

Out of scope: baking the OpenSpec CLI into the environment images, adding an
`android` flavour to `environments/Dockerfile` (the failing image is built
elsewhere), and any change to propose-turn behavior or the workflow transitions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: cache volumes become writable by the turn user; per-turn
  limits are enforced by the service and the token budget is defined to exclude
  cache reads.
- `workflow-orchestration`: a turn that produces no change reports the turn's
  summary and questions on the pull request.

## Impact

- `src/runtime/sandbox.ts` - add `buildCachePrepareArgs`, the root `chown`
  argv that prepares a cache volume.
- `src/runtime/opencode/container-client.ts` - prepare the scoped cache volumes
  before the turn container starts.
- `src/runtime/limits.ts` - count only the tokens of new work against the token
  budget.
- `src/service.ts` - wrap the runtime in `LimitedRuntime` so limits are enforced.
- `src/orchestrator/engine.ts` - carry the turn's summary and questions into the
  failure comment.
- Tests for each, plus the `agent-runtime` and `workflow-orchestration` spec
  deltas.
