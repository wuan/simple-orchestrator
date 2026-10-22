# Proposal

## Why

The turn environment images cover `node`, `rust`, and `android`, but nothing
that can build an embedded firmware project: a PlatformIO repository such as
[`wuan/klimacontrol`](https://github.com/wuan/klimacontrol) has to fall back to
the host or fail on a missing `pio` and a missing host compiler, and a turn
cannot install a toolchain to recover. An embedded repository becomes a
first-class citizen only once its toolchain is a published flavour.

## What Changes

- Add a `platformio` stage to `environments/Dockerfile` that installs PlatformIO
  Core together with the coverage and the pinned formatting and lint tools the
  repository's test report and commit gate use, exposes `pio` and its core
  directory, and makes them usable by an arbitrary uid.
- Document the flavour, how a repository points at it, and the cache volume that
  keeps the platforms, toolchains, and libraries `pio` downloads between turns,
  and extend the environment-workflow invariant test.

Out of scope: pre-installing a PlatformIO platform, framework, or library (the
project's `platformio.ini` resolves them at turn time), baking the OpenSpec CLI
into the image (the repository's validation script resolves it through `npx`),
USB upload or flashing, and the other flavours, the image contract, the SDK pin,
the platform rule, and the tag policy, which are unchanged.

## Capabilities

### New Capabilities

None. The image set, its platform rule, and its SDK pin are owned by
`environment-images`.

### Modified Capabilities

- `environment-images`: a new requirement states that the `platformio` flavour
  provides PlatformIO Core and the coverage, formatting, and lint tools an
  embedded repository's builds, tests, and checks need, and that it exposes
  PlatformIO's core directory as a stable cache path.

## Impact

- `environments/Dockerfile` - a new `FROM base AS platformio` stage with
  PlatformIO Core in a system virtual environment, `lcov`, the pinned
  `clang-format`, `shellcheck`, and `pre-commit`, and comments explaining the
  core-directory cache path and the both-platform publication.
- `environments/README.md` - the flavour table, the PlatformIO prose and a usage
  snippet with a `/tmp/.platformio` cache volume.
- `docs/configuration.md` - name the PlatformIO toolchain among the container
  toolchains.
- `src/runtime/opencode/environments.test.ts` - assert the PlatformIO stage and
  that no other flavour carries it.
- No runtime or configuration change: a repository points `environment.image` at
  `ghcr.io/wuan/simple-orchestrator/platformio` and adds a PlatformIO cache
  volume.
