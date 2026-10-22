# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `environments/Dockerfile` defines each flavour as a `FROM base AS <name>`
  stage on the shared `base` (`node:24-bookworm-slim` plus git, Python 3, `make`,
  `g++`, and the pinned `@opencode/sdk`). CI discovers those stages, builds each
  as a target, and publishes `ghcr.io/wuan/simple-orchestrator/<name>` for both
  supported platforms unless the stage declares otherwise with a
  `# platforms:` line.
- PlatformIO Core is a Python package; `pio` runs the project's SCons build and
  downloads the platforms, toolchains, frameworks, and libraries a
  `platformio.ini` declares into its core directory (`PLATFORMIO_CORE_DIR`,
  default `$HOME/.platformio`). A turn runs as the orchestrator's uid/gid with a
  writable `HOME` of `/tmp`, and `docker run --rm` discards the container layer
  after each turn, so only a mounted cache volume persists a download.
- [`wuan/klimacontrol`](https://github.com/wuan/klimacontrol) is an ESP32-S2
  firmware built with the `espressif32` platform; its `native` test environment
  compiles with the host `g++` (from `base`) and its CI installs PlatformIO with
  `pip`, the `lcov` coverage tool, and the pinned `clang-format` and `shellcheck`
  that its commit gate uses.
- PlatformIO publishes the platform-specific `espressif32` tools (the xtensa
  toolchain, `tool-mkspiffs`, and `tool-mklittlefs`; `tool-esptoolpy` is Python)
  for `linux_aarch64` as well as `linux_x86_64`, so the flavour can be published
  for both platforms without a `# platforms:` restriction.
- `src/runtime/opencode/environments.test.ts` pins the flavour set, the shared
  base, and the per-flavour platform derivation from the Dockerfile and workflow
  text, and is the natural place to pin the new rules.

## Goals / Non-Goals

**Goals:**

- A published `platformio` flavour that builds and tests an embedded repository
  in a turn without installing a toolchain: PlatformIO Core, the coverage
  tooling its test report uses, and the pinned formatting and lint tools its
  commit gate expects.
- Keep the downloads `pio` makes out of the throwaway container layer, so a
  mounted cache volume keeps them warm across turns.
- Publish `platformio` for both supported platforms.
- Keep `node`, `rust`, and `android` exactly as they are.

**Non-Goals:**

- Pre-installing a PlatformIO platform, framework, or library; the project's
  `platformio.ini` resolves them, exactly as a local checkout would.
- Baking the OpenSpec CLI into the image; the repository's validation script
  resolves it through `npx`, and `base` already provides Node.js.
- Flashing or uploading to a device (`pio run -t upload`), which needs USB
  hardware a turn container does not have.
- Changing the image contract, the SDK pin, the platform-declaration rule, the
  tag policy, or the attestation behaviour.

## Decisions

### Install PlatformIO Core in a system virtual environment

Install `python3-venv` and create a virtual environment at `/opt/platformio`,
then `pip install platformio` into it and prepend `/opt/platformio/bin` to
`PATH`. Debian bookworm's system Python is externally managed (PEP 668), so a
plain `pip install` fails; a virtual environment is the supported install and
keeps `pio` out of the build user's `$HOME`. `chmod -R a+rwX /opt/platformio`
lets the arbitrary-uid turn read and run `pio` and add a tool if it needs to.

Alternatives considered:

- The official `get-platformio.py` installer: rejected, it installs into
  `~/.platformio/penv` and puts the launcher in `~/.local/bin`, both of which are
  the build user's home in an image whose turns run as a different uid with
  `HOME=/tmp`.
- `pip install --break-system-packages` into the system Python: rejected as the
  default mechanism; it writes PlatformIO into the distro's Python and gives the
  turn no isolated place to add a tool.
- A third-party PlatformIO base image: rejected, it breaks the "every flavour is
  `FROM base` and inherits the contract in one place" rule.

### Keep the downloaded platforms in a cache volume, not the image

Set `PLATFORMIO_CORE_DIR=/tmp/.platformio` (the turn's `HOME` is `/tmp`) and
document a cache volume mounted there. `pio` downloads a platform's toolchain
and framework on first use; `docker run --rm` throws away everything not on a
volume, so the volume is what makes later turns warm. The orchestrator already
makes a mounted cache volume writable before the turn, so a named volume here is
usable.

Alternatives considered:

- Pre-install `espressif32` (the `klimacontrol` platform) into the image:
  rejected as the default; the image would bake one project's platform choice,
  grow by hundreds of megabytes, and a volume mounted at the core directory
  would hide it anyway.
- Install into the image's `/opt` and rely on the container layer: rejected, the
  layer is discarded with `--rm`, so the download would repeat every turn.
- Bind-mount a host directory: rejected, the `caches` contract is named volumes
  and the image should not require a host cache root.

### Include the repository's coverage and gate tools

The flavour installs `lcov` (the `klimacontrol` coverage report runs it), the
`clang-format` version the repository pins (`19.1.7`, matching its CI and
pre-commit hook), `shellcheck`, and `pre-commit`, so a turn can run the native
test, coverage, and formatting checks the repository's CI will run before it
commits. Pinning `clang-format` is deliberate: different majors reformat macro
line-continuations differently, so an unpinned one would silently reformat the
repository.

Alternatives considered:

- A minimal PlatformIO-only flavour and leave formatting to a host install:
  rejected, the repository's gate expects `clang-format` and `shellcheck`, and a
  turn that cannot run them either fails the hook or pushes a formatting
  regression CI then rejects.
- Install `pre-commit` only, not the tools it drives: rejected, the hooks use
  `language: system` for `clang-format` and `shellcheck`, so the tools must be on
  `PATH` anyway.

### Pin PlatformIO Core, resolve platforms from the project

Install a pinned `platformio` version (a build arg with a default) so the build
fails loudly rather than baking a moving target, and let the project's
`platformio.ini` resolve the platform, framework, and library versions at turn
time, exactly as on a developer's machine. Raise the pin here when the
repository moves.

### Publish for both supported platforms

The stage declares no `# platforms:` line, so it inherits the both-platform
default. PlatformIO publishes its `espressif32` tool packages for `linux_aarch64`
and `linux_x86_64`, so an arm64 host pulls a native image. A platform a future
project adds that lacks an arm64 build would fail at `pio`'s download on arm64,
not because the image is mislabelled.

## Risks / Trade-offs

- [The first turn in a new cache downloads a full toolchain] -> that is the same
  cold cost a local checkout pays; the documented cache volume makes later turns
  warm, and the orchestrator's wall-clock limit still bounds the turn.
- [PlatformIO Core drifts from the repository's CI] -> the core version is pinned
  in the Dockerfile and the project's `platformio.ini` pins the platform; the
  invariant test asserts the stage, and the pin is raised in one place.
- [`clang-format` drifts from the repository's pin] -> it is installed at the
  repository's exact version from a build arg; raising the repository's pin means
  raising the build arg, and this design says so.
- [A third-party platform lacks an arm64 tool] -> the flavour is still published
  for both platforms; the failure is a normal `pio` download error on arm64, and
  a project can pin an arm64-capable platform.
- [Baking the gate tools is broader than a pure PlatformIO flavour] -> recorded
  as an open question; removing them means dropping install lines without
  changing the requirement's core.

## Migration Plan

1. Land the Dockerfile, docs, and test changes on a pull request; the PR build
   proves the native-only path and pushes nothing.
2. On the default branch, the next push publishes
   `ghcr.io/wuan/simple-orchestrator/platformio:latest` for both platforms and
   republishes `node`, `rust`, and `android` unchanged.
3. Point an embedded repository's `environment.image` at the new tag and add a
   `/tmp/.platformio` cache volume; no orchestrator change is involved.
4. Rollback removes the `platformio` stage; the next default-branch push
   republishes the previous image set.

## Open Questions

- Should the flavour pre-install the `espressif32` platform so a first turn is
  fast, at the cost of a project-specific image that grows by hundreds of
  megabytes? The decision above is no; the maintainers may prefer yes for
  `klimacontrol`.
- Should the flavour carry the repository's gate tools (`clang-format`,
  `shellcheck`, `pre-commit`), or only PlatformIO Core and leave the gate to the
  host? The decision above is to carry them.
