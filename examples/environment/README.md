# Example turn environment image

An environment image gives a repository's containerized turns their toolchain.
The orchestrator does not ship an image; build one per repository, or share a
base image across repositories and extend it.

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

## Build

```bash
# Use the orchestrator's @opencode/sdk version for the build argument.
docker build \
  --build-arg OPENCODE_SDK_VERSION=2.0.31 \
  -t openspec-agent-example examples/environment
```

The `Dockerfile` in this directory is a minimal base: it installs Node 24 and
git and pins the SDK. Add the repository's toolchain on top of it.

## Published flavours

This directory is the minimal example and the reference for the image contract.
Ready-made flavours - a Rust toolchain for
[`bo-srv-rs`](https://github.com/wuan/bo-srv-rs), for example - live in
[`environments/`](../../environments/README.md), where they extend the same
contract from a shared `base` stage and are published to GHCR by CI. Prefer
`ghcr.io/wuan/simple-orchestrator/<flavour>` when one fits the repository.

## Configure

Point a repository at the built image (see
[`docs/configuration.md`](../../docs/configuration.md) for every `environment`
field):

```yaml
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
    environment:
      image: openspec-agent-example
      env:
        - GREENPT_API_KEY
      gitIdentity:
        name: OpenSpec Agent
        email: agent@example.com
```

Repositories without an `environment` keep running turns in-process.
