# Proposal

## Why

The turn environment images cover `node`, `rust`, `android`, and `platformio`, but
nothing for a Python repository that resolves its interpreter and dependencies
with `uv`. A repository such as `wuan/docoracle`, `wuan/voxoracle`, or
`wuan/scan-pdf` has to fall back to the host or install `uv` inside every turn,
and a turn cannot install packages system-wide because it runs as the
orchestrator's unprivileged uid. Python repositories become first-class citizens
only once `uv` is a published flavour.

## What Changes

- Add a `uv` stage to `environments/Dockerfile` that installs a pinned `uv`
  binary, exposes it on `PATH` for any uid a turn runs as, and defines cache paths
  for the interpreters, packages, and tools `uv` downloads.
- Let the repository's `pyproject.toml` and `uv.lock` resolve the Python version
  and dependencies at turn time, exactly as its CI does; do not bake a project's
  interpreter, dependency tree, or development tools into the image.
- Document the flavour, how a repository points at it, and the cache volume that
  keeps `uv`'s interpreter and package downloads between turns, and extend the
  environment-image invariant test.

Out of scope: baking Python interpreters or project development tools into the
image, system libraries a specific repository may need (for example PortAudio),
and the other flavours, the image contract, the SDK pin, the platform rule, the
tag policy, and the attestation behaviour, which are unchanged.

## Capabilities

### New Capabilities

None. The image set, its platform rule, and its SDK pin are owned by
`environment-images`.

### Modified Capabilities

- `environment-images`: new requirements state that the `uv` flavour provides
  `uv`, exposes stable cache paths for the interpreters and packages `uv`
  downloads, is usable by an unprivileged turn, and leaves the Python version and
  project tooling to the repository.

## Impact

- `environments/Dockerfile` - a new `FROM base AS uv` stage with a pinned `uv`
  binary, cache-path environment variables, and comments explaining the
  package/interpreter cache and the both-platform publication.
- `environments/README.md` - the flavour table, the uv prose and a usage snippet
  with a uv cache volume.
- `docs/configuration.md` - name the uv toolchain among the container toolchains.
- `src/runtime/opencode/environments.test.ts` - assert the uv stage and that no
  other flavour carries it.
- No runtime, workflow, or configuration change beyond the repository's
  `environment.image` and cache volume: CI discovers and publishes the new stage
  automatically.
