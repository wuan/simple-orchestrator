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
the `node`, `rust`, `platformio`, and `uv` flavours cover `linux/amd64` and
`linux/arm64`, while `android` covers `linux/amd64` only (see
[Platforms](#platforms)). The tags name
an image index rather than a single architecture, so the host's container
runtime selects the image matching its own platform and the flavour runs
natively wherever it is published. A pull-request build validates only the
runner's native `linux/amd64` platform and does not emulate `linux/arm64`;
publications cover the flavour's declared platforms.

Pushes to `main` publish `latest`, the branch name, and an SDK-version tag
`<flavour>:sdk-<version>`; version tags publish the semantic versions; every
publish also carries a short commit-SHA tag. The SDK-version tag names the
`@opencode/sdk` the image installs, so it is the tag to use when pairing an
image with a checkout. Pull requests build the image without pushing, so an
image change is validated before it lands and no tag reaches the registry.

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
      image: ghcr.io/wuan/simple-orchestrator/rust
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
[`docs/configuration.md`](../docs/configuration.md#environment). The example
leaves the tag off: the orchestrator selects the `<flavour>:sdk-<version>` build
for its own `@opencode/sdk` version. Name an explicit tag (such as
`rust:sdk-2.0.32`) only when you need one particular build.

## Flavours

| Flavour      | Toolchain                                                                                             | Used for                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `node`       | Node.js 24 and `git` - the image contract itself                                                      | Repositories needing no toolchain beyond the contract                                         |
| `rust`       | `rustc`/`cargo` (stable, `clippy`, `rustfmt`), `build-essential`, `cmake`, `pkg-config`, `libssl-dev` | [bo-srv-rs](https://github.com/wuan/bo-srv-rs) and other Rust repositories                    |
| `android`    | `openjdk-17-jdk` and the Android SDK (`platform-tools`, `platforms;android-35`, `build-tools;35.0.0`) | Android repositories that build with Gradle and the Android Gradle Plugin                     |
| `platformio` | PlatformIO Core on Python 3.12, `lcov`, the pinned `clang-format` and `shellcheck`, and `pre-commit`  | [klimacontrol](https://github.com/wuan/klimacontrol) and other embedded firmware repositories |
| `uv`         | The pinned `uv` binary and cache paths under `/tmp/.uv`                                               | Python repositories that resolve interpreters and dependencies with uv                        |

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

The PlatformIO flavour installs PlatformIO Core on Python 3.12 in a virtual
environment, the `lcov` coverage tool an embedded repository's test report runs,
and the pinned `clang-format` and `shellcheck` its commit gate expects, alongside
`pre-commit`. It carries Python 3.12 because Debian bookworm's system Python is
3.11 while an embedded repository's pre/post scripts may use 3.12 language
features (klimacontrol's `compress_web.py` does); the copied interpreter lives in
`/opt/python312` and only this flavour uses it, so the base and the other flavours
keep their system Python. It exposes PlatformIO's core directory at
`/tmp/.platformio` through `PLATFORMIO_CORE_DIR`, so a cache volume there keeps
the platforms, toolchains, and libraries `pio` downloads between turns; the
project's `platformio.ini` resolves them at turn time exactly as a local checkout
would. Point an embedded repository at it with a PlatformIO cache volume reused
across turns:

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

The uv flavour installs the pinned `uv` binary in `/usr/local/bin`, so a turn
runs `uv sync`, `uv run`, `uvx`, and `pre-commit` without installing `uv`. It
leaves the Python version, dependencies, and development tools to the
repository's `pyproject.toml`, `uv.lock`, and `.python-version`, so the image
carries no interpreter and no project tools. The interpreters, packages, and
tools `uv` downloads live under `/tmp/.uv`, exposed through `UV_CACHE_DIR`,
`UV_PYTHON_INSTALL_DIR`, `UV_TOOL_DIR`, and `PRE_COMMIT_HOME`; a cache volume
there keeps them warm between turns. Point a Python repository at it with a uv
cache volume reused across turns:

```yaml
repositories:
  - name: docoracle
    environment:
      image: ghcr.io/wuan/simple-orchestrator/uv:latest
      env:
        - LLM_API_KEY
      caches:
        - name: uv
          path: /tmp/.uv
```

`UV_LINK_MODE=copy` makes uv copy rather than hardlink from the cache volume
into the bind-mounted worktree, which is normally a different filesystem.

## Live-hardware USB devices

A turn can drive attached USB hardware when its repository's `environment`
names host device paths in `devices` and the groups that own them in `groups`
(see [`docs/configuration.md`](../docs/configuration.md#device-access-for-live-hardware)).
The orchestrator maps each path into the container with Docker's `--device` and
runs the container process in the configured supplementary groups. It adds no
privileged mode and mounts no host `/dev`; an environment that names no devices
keeps Docker's default isolated device set. Direct device mapping is **Linux
only**.

### udev rules

Give the board and the meter stable names and let the turn's non-root user open
them. Create `/etc/udev/rules.d/99-simple-orchestrator-usb.rules`:

```udev
# The QT Py ESP32-S2 firmware CDC interface and ROM USB OTG bootloader share one
# stable name because only one is present at a time.
SUBSYSTEM=="tty", ATTRS{idVendor}=="239a", ATTRS{idProduct}=="8111", SYMLINK+="qtpy2", GROUP="dialout", MODE="0660"
SUBSYSTEM=="tty", ATTRS{idVendor}=="303a", ATTRS{idProduct}=="0002", SYMLINK+="qtpy2", GROUP="dialout", MODE="0660"

# The JT-UM120's measurement path is its HID interface, not its CDC port.
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="2e3c", ATTRS{idProduct}=="5558", SYMLINK+="jtum120", GROUP="dialout", MODE="0660"

# Keep ModemManager off the ESP32 CDC ports so enumeration and flashing do not hang.
SUBSYSTEM=="tty", ATTRS{idVendor}=="239a", ENV{ID_MM_DEVICE_IGNORE}="1"
SUBSYSTEM=="tty", ATTRS{idVendor}=="303a", ENV{ID_MM_DEVICE_IGNORE}="1"
```

The ESP32-S2's ROM bootloader enumerates as USB OTG `303a:0002`; `303a:1001` is
the USB-Serial/JTAG ID used by ESP32-S3/C3-class chips. Naming `0002` keeps
`qtpy2` present through the reset the uploader performs before flashing.

Reload the rules and trigger the device events:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=tty --subsystem-match=hidraw
```

Use `GROUP`/`MODE` rather than `TAG+="uaccess"`: the host ACL applies to the
logged-in user and does not cross into the container. `GROUP` plus the
orchestrator's `--group-add` (from `environment.groups`) is what lets the
non-root turn open the node.

Point the repository at the PlatformIO flavour and the stable names:

```yaml
repositories:
  - name: klimacontrol
    environment:
      image: ghcr.io/wuan/simple-orchestrator/platformio
      devices:
        - /dev/qtpy2
        - /dev/jtum120
      groups:
        - dialout
      env:
        - LLM_API_KEY
      caches:
        - name: platformio
          path: /tmp/.platformio
```

Each configured path is checked when a turn starts: it must be absolute, resolve
through symlinks, and be a character device. A missing, dangling, or non-device
path fails the turn naming the configured path. The check runs every turn, so a
stable name follows a device replugged between turns; Docker resolves the symlink
when it creates the container, which is why the turn can open `/dev/qtpy2` even
though the host's link points at a transient `/dev/ttyACM*`.

A device that re-enumerates **during** a turn is fixed when the container is
created. The hardware spike found the ESP32-S2's ROM bootloader re-enumerating
on the same `ttyACM` minor as the firmware, so the container's node stayed
usable; a host that assigns a different minor mid-flash would leave the node
stale. Dynamic device-class exposure remains a separate change.

### macOS and USB/IP

Direct device access requires a Linux host. Docker Desktop on macOS runs
containers in a VM without the host's device tree, so `--device` cannot reach a
USB device attached to the Mac. Run the orchestrator on a Linux host, or forward
the device over USB/IP and point `devices` at the forwarded node.

## Platforms

A flavour is published for exactly the platforms its toolchain supports. The
`node`, `rust`, `platformio`, and `uv` flavours cover both `linux/amd64` and
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
