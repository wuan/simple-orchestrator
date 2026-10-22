# Design

## Context

Turns run either in-process (embedded OpenCode) or in an environment container.
Limits, caches, and failure reporting straddle the runtime boundary:

- `src/runtime/limits.ts` has a `LimitedRuntime`/`TurnLimiter` pair, but the
  service never wraps the runtime, so nothing enforces `config.limits`.
- `src/runtime/opencode/container-client.ts` mounts `environment.caches` as
  named volumes; Docker creates them root-owned and the turn runs as the
  orchestrator's uid, so a path the image does not pre-create is unwritable.
- `src/orchestrator/engine.ts` builds the failure comment from the error alone,
  discarding the `TurnResult` returned by the failed turn.

## Goals / Non-Goals

**Goals:**

- Enforce the configured per-turn limits through the existing limiter.
- Make every configured cache volume usable by the turn, without requiring each
  image to pre-create the path.
- Put the agent's own summary and questions on the pull request when a turn that
  must produce a change does not.

**Non-Goals:**

- Changing the OpenCode adapter's step reporting (it reports no `steps`, so the
  step limit is only effective for runtimes that do).
- Baking the OpenSpec CLI into images, or adding the `android` flavour to this
  repository's `environments/Dockerfile`.
- Changing the workflow transitions, the watermark, or the propose path.

## Decisions

### Enforce limits by wrapping the runtime in `createService`

The service is the one place that builds the runtime for every repository, so
wrapping there bounds in-process and containerised turns alike without touching
each runtime adapter. An injected `runtime`/`runtimeFactory` is wrapped too,
which is what makes the guarantee hold regardless of configuration.

Alternative considered: enforce inside each adapter. Rejected - it duplicates
the logic and leaves custom runtimes unbounded.

### Define the token budget as tokens of new work

A real turn reports a multi-million-token total that is almost entirely cache
reads (the reproduction: 2.6 M read, 81 k new). Counting the total would fail
every turn at the documented `maxTokens: 200000`, so the budget counts input,
output, reasoning, and cache write, and excludes cache reads. The limiter falls
back to the reported total when a runtime reports only a total, so fake and
future runtimes still work.

Alternative considered: keep counting the total and raise the default. Rejected -
it makes the default meaningless and bills the agent for re-reading its own
context.

### Prepare cache volumes with a short root `chown`

A named volume is created root-owned; only a root process can change its
ownership, and the turn deliberately runs as the orchestrator's user. Before the
turn container starts, the client runs `docker run --rm --user 0:0
--entrypoint chown --volume <vol>:<path> <image> <uid>:<gid> <path>`, once per
volume per process, and records the volume so later turns skip it. The chown is
non-recursive on the mount path: after the first successful turn the volume's
contents are owned by the turn user, so only the mount point needs fixing.

Preparation is best-effort: a failure to run it is logged at verbose level and
the turn proceeds, because an image that cannot run `chown` should not be unable
to run a turn - it simply does not get a warm cache. Failing the turn instead
would turn a caching optimisation into an availability regression.

Alternative considered: require every image to pre-create its cache paths as
world-writable (as the `rust` flavour does for `/usr/local/cargo`). Rejected as
the only mechanism: the failing `android` image is built outside this repository,
and a host-side fix helps any image.

Alternative considered: bind-mount host directories instead of named volumes.
Rejected: it changes the documented `caches` contract and the volume-scoping
behavior, and needs a host cache root the configuration does not define.

### Carry the turn result into the failure comment

`NoProgressError` gains the summary and questions of the turn that produced no
change, and `signalFailure` appends them to the comment when present. The
existing error message stays the first line, so existing assertions and the
operator's mental model are unchanged.

Alternative considered: ask the agent to comment before failing. Rejected - the
turn is over and the orchestrator owns the pull request comment.

## Risks / Trade-offs

- [The prepare container needs `chown` in the image] -> best-effort; a missing
  binary only logs and leaves the cache cold, as it is today.
- [Wrapping the runtime changes `runtime.id`] -> the id is only informational;
  the wrapper reports `<inner>+limits`.
- [Excluding cache reads weakens the token bound for providers that bill cache
  reads] -> the bound still caps new work and the wall-clock limit caps re-reads
  in time.
