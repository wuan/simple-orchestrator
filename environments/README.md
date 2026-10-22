# Turn environment images

The orchestrator runs a repository's turns inside a container when its config
sets an [`environment`](../docs/configuration.md#environment). This directory
builds the images that give those turns a toolchain.

An image is called a **flavour**: a repository's toolchain on top of the shared
`base` stage in [`Dockerfile`](Dockerfile). The base meets the image contract
below and every flavour inherits it, so the contract lives in exactly one place.
The `node` flavour is the base itself, published for repositories that need no
toolchain beyond the contract.

## Image contract

An environment image must provide:

- **Node.js 24+** - the mounted turn runner is compiled JavaScript, run by the
  image's `node`.
- **git** - the turn commits to the workflow branch, which the orchestrator then
  publishes from the host.
- **`@opencode/sdk`** at the orchestrator's version, installed for the image's
  own platform. The runner resolves the SDK from `/opt/runner/node_modules` and
  fails fast when the installed version differs from the orchestrator's, so
  drift surfaces as a clear startup error rather than an obscure one.
- The repository's toolchain (Android SDK/Gradle, JDK, Rust, ...).

The compiled runner is **not** copied into the image. The orchestrator mounts
its `dist/` directory read-only at `/opt/runner/dist` per turn, so the mounted
artifact stays platform-independent and the image resolves the SDK for its own
platform. The orchestrator also mounts the repository store and the turn
worktree at their identical host paths (so the worktree's `.git` pointer
resolves), passes provider variables by name, runs the container as the
orchestrator's uid/gid, and gives it a writable `HOME`.

## Published images

CI ([`.github/workflows/environments.yml`](../.github/workflows/environments.yml))
builds every flavour and publishes it to the GitHub Container Registry:

```
ghcr.io/wuan/simple-orchestrator/<flavour>
```

Every flavour is published for exactly the platforms its toolchain supports:
the `node`, `rust`, and `platformio` flavours cover `linux/amd64` and
`linux/arm64`, while `android` covers `linux/amd64` only (see
[Platforms](#platforms)). The tags name
an image index rather than a single architecture, so the host's container
runtime selects the image matching its own platform and the flavour runs
natively wherever it is published. A pull-request build validates only the
runner's native `linux/amd64` platform and does not emulate `linux/arm64`;
publications cover the flavour's declared platforms.

Pushes to `main` publish `latest` and the branch name; version tags publish the
semantic versions; pull requests build the image without pushing, so an image
change is validated before it lands.

Because `latest` is a mutable tag, the orchestrator refreshes a repository's
image before each containerized turn, so a republished `latest` is picked up
without a manual `docker pull`. A digest-pinned image is never re-checked, and
set `environment.pull: missing` or `never` to keep the local image or run fully
offline.

The build's provenance and SBOM are published as signed attestations attached to
the published image digest rather than as entries in the image index, so a
published tag's index contains exactly the flavour's supported platform
manifests and no `unknown/unknown` entry. Verify them with the GitHub CLI:

```bash
gh attestation verify ghcr.io/wuan/simple-orchestrator/<flavour> --owner wuan
```

Point a repository at a published flavour:

```yaml
repositories:
  - name: bo-srv-rs
    environment:
      image: ghcr.io/wuan/simple-orchestrator/rust:latest
      env:
        - LLM_API_KEY
      gitIdentity:
        name: OpenSpec Agent
        email: agent@example.com
      caches:
        - name: cargo
          path: /usr/local/cargo
```

The image is the only field that must name a flavour; the rest is the shared
`environment` block documented in
[`docs/configuration.md`](../docs/configuration.md#environment).

## Flavours

| Flavour      | Toolchain                                                                                             | Used for                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `node`       | Node.js 24 and `git` - the image contract itself                                                      | Repositories needing no toolchain beyond the contract                                         |
| `rust`       | `rustc`/`cargo` (stable, `clippy`, `rustfmt`), `build-essential`, `cmake`, `pkg-config`, `libssl-dev` | [bo-srv-rs](https://github.com/wuan/bo-srv-rs) and other Rust repositories                    |
| `android`    | `openjdk-17-jdk` and the Android SDK (`platform-tools`, `platforms;android-35`, `build-tools;35.0.0`) | Android repositories that build with Gradle and the Android Gradle Plugin                     |
| `platformio` | PlatformIO Core, `lcov`, the pinned `clang-format` and `shellcheck`, and `pre-commit`                 | [klimacontrol](https://github.com/wuan/klimacontrol) and other embedded firmware repositories |

The Rust flavour matches the toolchain and native build dependencies a Rust
repository's CI installs, including `libssl-dev` so a dependency tree that links
the system OpenSSL (for example `wuan/mqtt-gateway`'s `native-tls` and
`postgres-native-tls`) compiles inside a turn. Its database integration tests
need a Docker daemon (`testcontainers`), which is not available inside a turn
container; the default `cargo test` suite runs without Docker.

The Android flavour installs the JDK and Android SDK a Gradle build declares
(`openjdk-17-jdk`, the SDK command-line tools, one SDK platform, and one build
tools revision), accepts the SDK licences, and exposes the SDK through
`ANDROID_HOME` and `ANDROID_SDK_ROOT` so a turn builds an Android app without
installing a toolchain. Gradle comes from the repository's wrapper rather than
the image. The SDK directory is writable, so Gradle can resolve the platform and
build-tools revision a project pins even when it differs from the one above.
Point an Android repository at it with a Gradle cache volume reused across
turns:

```yaml
repositories:
  - name: my-android-app
    environment:
      image: ghcr.io/wuan/simple-orchestrator/android:latest
      env:
        - LLM_API_KEY
      caches:
        - name: gradle
          path: /tmp/.gradle
```

The turn's `HOME` defaults to `/tmp`, so `~/.gradle` is `/tmp/.gradle`; the
cache volume keeps the Gradle wrapper, dependency, and build caches between
turns.

The PlatformIO flavour installs PlatformIO Core in a virtual environment, the
`lcov` coverage tool an embedded repository's test report runs, and the pinned
`clang-format` and `shellcheck` its commit gate expects, alongside `pre-commit`.
It exposes PlatformIO's core directory at `/tmp/.platformio` through
`PLATFORMIO_CORE_DIR`, so a cache volume there keeps the platforms, toolchains,
and libraries `pio` downloads between turns; the project's `platformio.ini`
resolves them at turn time exactly as a local checkout would. Point an embedded
repository at it with a PlatformIO cache volume reused across turns:

```yaml
repositories:
  - name: klimacontrol
    environment:
      image: ghcr.io/wuan/simple-orchestrator/platformio:latest
      env:
        - LLM_API_KEY
      caches:
        - name: platformio
          path: /tmp/.platformio
```

## Platforms

A flavour is published for exactly the platforms its toolchain supports. The
`node`, `rust`, and `platformio` flavours cover both `linux/amd64` and
`linux/arm64`; a host on either architecture pulls a native image.

The `android` flavour is published for **`linux/amd64` only**: Google publishes
the Linux Android SDK command-line tools and the build tools (`aapt2`) for
`x86_64` only, with no `linux-arm64` classifier, so an arm64 image would carry
binaries that cannot run. A host that pulls the `android` tag on `linux/arm64`
gets a clear no-matching-platform error instead of a broken image.

A stage declares its platforms with a `# platforms: <comma-separated list>`
comment in the comment block immediately above its `FROM base AS <name>` line:

```dockerfile
# platforms: linux/amd64
FROM base AS android
```

A stage without the declaration defaults to `linux/amd64,linux/arm64`. The
workflow's flavour discovery reads the declaration from the Dockerfile, so
adding a flavour or restricting its platforms needs no workflow edit.

## Add a flavour

Append a stage to [`Dockerfile`](Dockerfile):

```dockerfile
FROM base AS java

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jdk \
  && rm -rf /var/lib/apt/lists/*
```

That is the only edit. The workflow discovers every `FROM base AS <name>` stage,
builds it as a target, and publishes `ghcr.io/wuan/simple-orchestrator/<name>`.
Flavours start from `base` deliberately, so no flavour can drift from the image
contract. Keep intermediate stages off `base` (build them from the underlying
image instead) so they are not published as a flavour.

## Build locally

The base has no default SDK version; pass the orchestrator's version (the exact
one in `package-lock.json`) so the mounted runner does not fail on drift:

```bash
docker build \
  --build-arg OPENCODE_SDK_VERSION=$(jq -r \
    '.packages["node_modules/@opencode/sdk"].version' package-lock.json) \
  --target node \
  -t ghcr.io/wuan/simple-orchestrator/node:local \
  environments
```

Swap `--target node` and the tag for another flavour. Then point a repository's
`environment.image` at the local tag.
