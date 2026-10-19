# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- The OpenCode host is embedded in-process through `@opencode/sdk`, whose
  dependency graph includes platform-specific native addons
  (`@lydell/node-pty`, `@parcel/watcher`, `fsevents`). Only the SDK is native;
  the orchestrator's own compiled output is pure JavaScript and loads the SDK
  lazily via `await import('@opencode/sdk')`.
- A turn's workspace is a `git worktree` whose `.git` is a file pointing at
  `<store>/.git/worktrees/<name>` by absolute path, and that directory points
  back at the worktree by absolute path.
- The host owns publishing, merge-gating, and readiness; the turn only commits
  to the workflow branch. Readiness runs the `openspec` binary against the host
  worktree path.
- Repositories without an environment must keep working unchanged.

## Goals / Non-Goals

**Goals:**

- Run a turn's whole agent loop and tools inside a per-repository image so any
  toolchain the image carries is available to the agent.
- Keep the mounted artifact platform-independent and version-matched.
- Keep secrets out of images and keep the host as the only publisher.
- Preserve the existing runtime seam, retry, limits, usage, and failure paths.

**Non-Goals:**

- Running an Android emulator or any privileged/KVM workload.
- Strong egress isolation of the agent (the model loop is in the container, so
  provider egress is required by default).
- A long-lived per-repository worker container or an operator-managed OpenCode
  server.
- Per-repository runtime instances.

## Decisions

### Whole turn in the container, not just the shell

Run the embedded OpenCode loop, the agent's tools, `git`, and `openspec` inside
the container. Alternative considered: keep the loop on the host and re-point
only the `bash` tool at a container through the plugin/tool editor. Rejected
because it leaves the loop and file tools on the host, requires intercepting
several tools, and a single miss exposes the host; whole-turn isolation also
makes read/write/edit naturally sandboxed. The cost is that the image needs
Node; that is accepted as part of the image contract.

### Portable runner bundle, SDK resolved in the image (M1)

Bind-mount only the compiled orchestrator JavaScript (a read-only mount of
`dist/` at the path the image expects, e.g. `/opt/runner/dist`). The image
installs `@opencode/sdk` at the orchestrator's version for its own platform.
Alternative considered: mount the orchestrator's full production
`node_modules`. Rejected because those native addons are built for the host
platform and cannot be mounted into a Linux image from a macOS/arm64 host.

The runner resolves the SDK lazily, exactly as `sdk-host.ts` does today, so the
bare specifier resolves from the image's `/opt/runner/node_modules`. The runner
reads the expected SDK version and fails fast when the image's version differs,
so drift surfaces as a clear startup error rather than an obscure one.

### The same `OpenCodeClient` seam, not a new runtime abstraction

Add `ContainerOpenCodeClient implements OpenCodeClient`; move nothing else. The
host-side runtime becomes `OpenCodeRuntime(new ContainerOpenCodeClient(...))`,
and `EmbeddedOpenCodeClient` is used both in-process (no environment) and inside
the runner. `buildSkillPrompt`, usage extraction, `assertTurnSucceeded`,
`LimitedRuntime`, retry, push, readiness, and the failure taxonomy are untouched.

### Per-repository environment threaded through `TurnRequest`

The engine and poller currently hold one runtime for every repository. Rather
than build one runtime per repository, the repository's resolved environment is
carried on `TurnRequest`, and the container client reads it. Alternative
considered: a runtime instance per repository in `service.ts`. Rejected because
it spreads per-repository state across pollers and duplicates a shared,
stateless client.

### Container lifecycle and protocol

One `docker run --rm -i` per turn, removed when the turn ends. The host writes a
JSON request (skill, prompt, workspace, model, agent, database) to the
container's stdin and reads newline-delimited JSON events from stdout: usage
events forwarded to `onUsage`, then a terminal result or error. stderr is
captured for diagnostics and redacted like every other diagnostic. Aborting the
turn's signal kills the container (`docker kill`, then a forced removal) so the
wall-clock limit is enforced even if the runner ignores the abort.

### Identity mounts, user, and home

Mount the repository store and the worktree at their identical absolute host
paths so the `.git` pointer resolves. Run with `--user <uid>:<gid>` and a
writable `HOME` so commits and temp files are owned by the orchestrator user and
the host's `git push` can read them. Pass a git author/committer identity as
environment so the agent's commits succeed without host git configuration.

### Secrets: environment pass-through, never baked

Provider credentials reach the container only through `environment.env`, which
names variables read from the orchestrator's process environment. No
`opencode.db` is mounted and no secret is written into an image.
`environment.gitIdentity` supplies the commit identity (also not a secret).
GitHub push credentials never enter the container because the container does not
push.

### Network and caches

The model loop is inside the container, so `network: none` is unusable by
default; the default allows provider egress, and `environment.network` can narrow
or change it per repository. Named volumes under `environment.caches` mount warm
tool caches (Gradle, Cargo, npm) at configured container paths and are scoped to
the repository so turns reuse them.

### Image contract

An environment image SHALL provide Node.js 24+, `git`, and the toolchain, and
SHALL have `@opencode/sdk` installed at the orchestrator's version. `openspec`
may be installed in the image or supplied by the runner's path. The repository
does not ship an image; the operator builds one per toolchain.

## Risks / Trade-offs

- [Image drifts from the orchestrator's SDK version] -> the runner asserts the
  expected version at startup and fails the turn with a clear message.
- [Container start adds latency per turn] -> acceptable; turns are long and
  already retried, and cache volumes remove repeated downloads.
- [Cold tool caches make Android turns slow or fail without network] ->
  documented cache volumes and a network default that permits dependency
  fetches.
- [Commits owned by the wrong user break the host push] -> `--user` plus a
  writable `HOME`; a mismatched ownership fails the turn instead of a later
  push.
- [Absolute-path mounts are easy to get subtly wrong] -> the store and worktree
  are mounted at the same paths; a wrong mount fails the turn's first `git`
  call with a container diagnostic.
- [A malformed protocol silently advances the workflow] -> a missing or invalid
  terminal result is a turn failure, never an empty success.
- [Provider credential exposure widens into the container] -> the credential is
  passed by name from the orchestrator's environment; no secret is baked, and
  logs remain redacted.

## Migration Plan

1. Add the `environment` config surface and validation; no behavior change when
   it is absent.
2. Add the runner entry point and the container client behind the existing
   `OpenCodeClient` seam, with tests driven by a fake command runner.
3. Thread the resolved environment from `service.ts` through the poller and
   engine onto `TurnRequest`.
4. Document the image contract and an example image in `docs/` and `README.md`.
5. Rollback is configuration-only: removing `environment` returns every
   repository to the in-process runtime.
