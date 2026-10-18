# Proposal

## Why

Turns currently execute their commands on the host, so an agent can only use the
toolchains the host happens to have. Repositories that need a specific runtime -
Android SDK/Gradle, a JDK, a Rust toolchain - cannot be worked on unless every
such toolchain is installed on the orchestrator machine, which does not scale and
pollutes the host. Operators want to hand the agent a pre-built environment per
repository, with stronger process isolation as a welcome byproduct.

## What Changes

- Add an optional per-repository `environment` block (and matching `defaults`
  entry) naming a container image and its run policy.
- A turn whose repository declares an `environment` runs entirely inside a
  container of that image: the embedded OpenCode loop, the agent's `bash`,
  `read`, `write`, and `edit`, `git`, and `openspec` all execute in the image.
- The orchestrator mounts the repository store and the turn's git worktree at
  their identical absolute paths, so the worktree's `.git` pointer resolves
  inside the container; it runs as the orchestrator's uid/gid with a writable
  `HOME` so commits land in the mounted store and the host can still push.
- The compiled orchestrator code is bind-mounted read-only per turn; the image
  resolves `@opencode/sdk` for its own platform, so the mounted bundle stays
  platform-independent.
- Provider authentication reaches the container by environment pass-through;
  no secret is baked into an image and no OpenCode database is shared.
- Repositories without an `environment` keep running turns in-process exactly
  as today, so this is additive and not breaking.
- The host retains publish, merge-gating, and readiness: the container commits
  to the workflow branch only, and the orchestrator pushes it afterwards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: adds containerized turn execution as a runtime mode, the
  per-repository environment image and its mount/identity/network policy, the
  provider-auth and git-identity inputs, and failure handling for container
  provisioning and protocol errors. The existing in-process embedded adapter
  remains the default.
- `orchestrator-configuration`: adds the optional `environment` block to
  repository entries and to `defaults`, with fail-fast validation of its fields.

## Impact

- `src/config/types.ts`, `src/config/loader.ts` - new `EnvironmentSpec`, parsing,
  defaults merge, and validation.
- `src/runtime/sandbox.ts` - `buildDockerRunArgs` is rewritten (identity mounts,
  `--user`, `HOME`, network, cache volumes) and `SandboxHandle` exposes the store
  path so the runtime can mount it.
- `src/runtime/types.ts` - `TurnRequest` carries the resolved environment.
- New `src/runtime/opencode/container-client.ts` -
  `ContainerOpenCodeClient implements OpenCodeClient`.
- New `src/runner.ts` - container entry point wrapping the existing
  `EmbeddedOpenCodeClient` behind a stdin/stdout JSON protocol.
- `src/orchestrator/engine.ts`, `src/orchestrator/poller.ts`,
  `src/service.ts`, `src/run.ts` - thread the environment through to the runtime.
- `docs/configuration.md`, `README.md` - document the `environment` block and the
  image contract (node + git + toolchain, with `@opencode/sdk` installed).
- No new runtime dependency; Docker remains an operator-provided runtime.
