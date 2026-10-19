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

Pushes to `main` publish `latest` and the branch name; version tags publish the
semantic versions; pull requests build the image without pushing, so an image
change is validated before it lands. Point a repository at a published flavour:

```yaml
repositories:
  - name: bo-srv-rs
    environment:
      image: ghcr.io/wuan/simple-orchestrator/rust:latest
      env:
        - GREENPT_API_KEY
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

| Flavour | Toolchain                                                                               | Used for                                                                   |
| ------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `node`  | Node.js 24 and `git` - the image contract itself                                        | Repositories needing no toolchain beyond the contract                      |
| `rust`  | `rustc`/`cargo` (stable, `clippy`, `rustfmt`), `build-essential`, `cmake`, `pkg-config` | [bo-srv-rs](https://github.com/wuan/bo-srv-rs) and other Rust repositories |

The Rust flavour matches the toolchain and native build dependencies bo-srv-rs's
own CI installs. Its database integration tests need a Docker daemon
(`testcontainers`), which is not available inside a turn container; the default
`cargo test` suite runs without Docker.

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
