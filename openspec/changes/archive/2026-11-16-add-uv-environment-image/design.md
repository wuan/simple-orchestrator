# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `environments/Dockerfile` defines each flavour as a `FROM base AS <name>` stage
  on the shared `base` (`node:24-bookworm-slim` plus git, Python 3, `make`,
  `g++`, and the pinned `@opencode/sdk`). CI discovers those stages, builds each
  as a target, and publishes `ghcr.io/wuan/simple-orchestrator/<name>` for both
  supported platforms unless the stage declares otherwise with a
  `# platforms:` line.
- The Python repositories that motivate the flavour resolve their environment
  with `uv`: `wuan/docoracle` (Python 3.12+, `uv run --frozen`), `wuan/voxoracle`
  (Python 3.13, `uv sync --frozen`), and `wuan/scan-pdf` (Python 3.11+,
  `uv sync --locked`, and a `uv_build>=0.13.7` build backend).
- A turn runs as the orchestrator's uid/gid with `HOME=/tmp`, and
  `docker run --rm` discards the container layer after each turn. The turn's
  worktree is ephemeral too, so a `.venv` created inside it does not survive the
  turn.
- Named cache volumes are scoped per repository and made writable by the turn's
  uid before the turn runs, so a mounted volume is what persists downloads
  between turns.
- The shared base carries Debian's Python 3.11, `make`, and `g++`, so a wheel
  that needs to compile can use the base's build tools; the flavour itself need
  not add a compiler.
- `src/runtime/opencode/environments.test.ts` pins the flavour set, the shared
  base, and per-flavour tool placement, and is the natural place to pin the new
  rules.

## Goals / Non-Goals

**Goals:**

- A published `uv` flavour that runs a uv-based Python repository's sync, tests,
  lint, type check, and commit hooks in a turn without installing `uv`.
- Keep the interpreters, packages, and tools `uv` downloads in a cache volume so
  later turns do not repeat the cold download.
- Let the repository's `pyproject.toml`, `uv.lock`, and `.python-version` decide
  the Python version and development tool versions.
- Keep `node`, `rust`, `android`, and `platformio` exactly as they are.

**Non-Goals:**

- Baking Python interpreters or project development tools into the image; the
  repository resolves them at turn time.
- Baking system libraries a specific repository needs, such as PortAudio for
  `voxoracle`'s audio runtime.
- Making the generic flavour work without network access; a turn still downloads
  a missing interpreter or package on its first cold run.
- Changing the image contract, the SDK pin, the platform-declaration rule, the
  tag policy, or the attestation behaviour.

## Decisions

### Install uv, not a fixed Python toolchain

Install a pinned `uv` binary into a system location on `PATH` and let `uv`
resolve the interpreter and dependencies from the repository. This mirrors the
PlatformIO decision: the image carries the entry tool, while the project's own
manifest pins the rest.

Alternatives considered:

- Bake Python 3.11-3.14 into the image: rejected as the default; it grows the
  image, fixes a version set the repositories will outgrow, and still needs a
  download path for a version outside the set.
- Use Debian's system Python plus `pip`: rejected; Debian bookworm's Python is
  externally managed (PEP 668), and the repositories already standardise on uv
  and `uv.lock`.
- Add `uv` to the shared base: rejected; it would change the image contract and
  the `node` flavour, which is meant to carry nothing beyond the contract.

### Copy the official uv binary into the flavour

Use the published `ghcr.io/astral-sh/uv:<version>` image as an intermediate stage
and copy its static `uv` binary into the `FROM base AS uv` stage. This keeps the
binary in a system path executable by an arbitrary uid and avoids an installer
that writes into the build user's `$HOME`.

Alternatives considered:

- Run the official installer in the build: rejected as the default; it installs
  under the build user's home unless redirected, and copying the published binary
  is simpler and already versioned.
- `pip install uv`: rejected; it couples the tool to a Python environment that the
  image deliberately does not fix.
- A third-party Python base image: rejected; every flavour must be `FROM base` so
  none can drift from the contract.

### Pin uv to a version the repositories' lockfiles accept

Install `uv` through a build argument with a pinned default, and keep the default
at or above the newest constraint the repositories declare (`scan-pdf` requires
`uv_build>=0.13.7,<0.14.0`). Raising the pin is a one-line Dockerfile change.

Alternatives considered:

- A floating `latest`: rejected; uv's lockfile and build-backend behaviour moves
  between releases, and a moving image would hide the drift.
- A deliberately old pin: rejected; it fails a repository whose build backend
  requires a newer uv.

### Cache interpreters, packages, and tools under one path

Set `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR`, and `UV_TOOL_DIR` under `/tmp/.uv`,
and document one cache volume at `/tmp/.uv`. `UV_TOOL_DIR` keeps `uvx` tools such
as a repository's pre-commit install; `PRE_COMMIT_HOME` is placed under the same
path so the hook environments pre-commit downloads persist too.

Set `UV_LINK_MODE=copy` because the cache volume and the bind-mounted worktree are
usually different filesystems; uv's hardlink optimisation would fall back to
copying anyway, and the explicit mode avoids repeated warnings.

Alternatives considered:

- Use uv's defaults under `HOME=/tmp`: rejected as the documentable contract; the
  interpreter directory and cache directory land in different places, so one
  cache volume would not cover both.
- Cache the `.venv` itself: rejected; the worktree path changes each turn, and an
  editable install would point at a stale path.
- Pre-populate the cache in the image: rejected; the cache belongs to the
  repository and would be hidden by the mounted volume.

### Leave project tooling to the repository

Do not install `ruff`, `basedpyright`, `pytest`, `pre-commit`, or any other
project tool. The repositories declare them in `pyproject.toml` optional
dependencies or dependency groups, and their CI runs `uv run` / `uv sync` so the
tools come from the project environment. The current gates already work that way:
`docoracle` runs pre-commit through `uv run --extra dev`, `voxoracle` runs
`uv run ruff` / `uv run basedpyright`, and `scan-pdf` installs pre-commit with
`uv pip` or runs it through the project environment.

Alternatives considered:

- Preinstall the tools as the PlatformIO flavour does: rejected; Python tool
  versions are project pins (ruff 0.16 in one repository, 0.17 in another), and a
  baked version would drift from `pyproject.toml`.
- Install only `pre-commit`: rejected; it still needs the project's hook entries
  and their tools on `PATH`, which the repository's uv environment provides.

### Publish for both supported platforms

The stage declares no `# platforms:` line, so it inherits the both-platform
default. `uv` publishes static binaries for `linux/amd64` and `linux/arm64`, and
the Python builds it installs do too. A repository dependency without an arm64
wheel fails at `uv sync` on arm64; that is a package-specific failure, not a
reason to mislabel the image.

### Keep repository-specific system libraries out of the generic flavour

Do not add PortAudio or other native libraries pre-emptively. The current audio
code imports `sounddevice` lazily, and its tests inject fakes, so PortAudio is not
needed for tests; the audio runtime itself cannot run meaningfully inside a turn
container without hardware. If a future test imports a native library, that
repository gets a variant or the library is added deliberately.

## Risks / Trade-offs

- [The first turn downloads a Python interpreter and dependencies] → the
  documented cache volume makes later turns warm; the orchestrator's wall-clock
  limit still bounds the cold turn.
- [uv's hardlink optimisation cannot cross filesystems] → `UV_LINK_MODE=copy`
  makes the fallback explicit and avoids log noise; the cache still saves the
  download.
- [uv drifts from a repository's lockfile or build backend] → the version is
  pinned in the Dockerfile, the invariant test asserts the stage, and raising the
  pin is local to the Dockerfile.
- [A repository needs a native system library] → the generic flavour does not
  provide it; add a repository-specific variant or bake the library deliberately
  rather than making every Python turn pay for it.
- [A turn has no network access] → the generic flavour cannot fetch a missing
  interpreter or package; an offline deployment needs baked interpreters and a
  populated cache instead.
- [uv may choose the base's Python 3.11 where CI uses another version] → the
  repository's `requires-python` / `.python-version` controls selection; pinning
  the repository's preferred interpreter is a repository concern, not an image
  concern.

## Migration Plan

1. Land the Dockerfile, docs, and test changes on a pull request; the PR build
   proves the native-only path and pushes nothing.
2. On the default branch, the next push publishes
   `ghcr.io/wuan/simple-orchestrator/uv:latest` and its SDK tag, and republishes
   the existing flavours unchanged.
3. Point a Python repository's `environment.image` at the new tag and add a
   `/tmp/.uv` cache volume; no orchestrator change is involved.
4. Rollback removes the `uv` stage; the next default-branch push republishes the
   previous image set.
