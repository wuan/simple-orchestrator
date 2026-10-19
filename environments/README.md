# Turn environment images

The orchestrator runs a repository's turns inside a container when its config
sets an [`environment`](../docs/configuration.md#environment). This directory
builds the images that give those turns a toolchain.

An image is called a **flavour**: a repository's toolchain on top of the shared
`base` stage in [`Dockerfile`](Dockerfile). The base meets the
[image contract](../examples/environment/README.md) - Node.js 24+, `git`, and
`@opencode/sdk` at the orchestrator's version - and every flavour inherits it.
The contract therefore lives in exactly one place.

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
  --target rust \
  -t ghcr.io/wuan/simple-orchestrator/rust:local \
  environments
```

Then point a repository's `environment.image` at the local tag.
