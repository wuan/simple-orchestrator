# syntax=docker/dockerfile:1
#
# Turn environment images, one per "flavour".
#
# A flavour is a repository's toolchain installed on top of the shared `base`
# stage. The base provides the image contract the orchestrator requires
# (Node.js 24+, git, and @opencode/sdk at the orchestrator's version; see
# ../examples/environment), so that contract lives in exactly one place and
# every flavour inherits it. Add a flavour by appending a `FROM base AS <name>`
# stage; CI discovers those stages and publishes one image per stage. Keep
# intermediate stages off `base` (build from the underlying image instead) so
# they are not mistaken for a publishable flavour.
#
# Build one flavour from the repository root (the build context is this
# directory):
#   docker build \
#     --build-arg OPENCODE_SDK_VERSION=<orchestrator @opencode/sdk version> \
#     --target rust \
#     -t ghcr.io/wuan/simple-orchestrator/rust:local \
#     environments
#
# CI (../.github/workflows/environments.yml) resolves the SDK version from
# package-lock.json, builds each discovered flavour, and publishes it to
# ghcr.io/wuan/simple-orchestrator/<flavour>.
#
# The orchestrator mounts its compiled runner read-only at /opt/runner/dist and
# resolves @opencode/sdk from /opt/runner/node_modules, so the mounted bundle
# stays platform-independent and the image resolves the SDK for its own
# platform.

# The orchestrator's @opencode/sdk version. Deliberately has no default: a stale
# default would silently bake the wrong SDK, so a build without it fails with a
# clear message instead. CI passes the version pinned in package-lock.json.
ARG OPENCODE_SDK_VERSION

# The shared base: the image contract every flavour must meet.
FROM node:24-bookworm-slim AS base

ARG OPENCODE_SDK_VERSION

RUN test -n "$OPENCODE_SDK_VERSION" \
  || { echo 'set --build-arg OPENCODE_SDK_VERSION=<orchestrator @opencode/sdk version>' >&2; exit 1; }

# git is required by the turn; add the repository's toolchain in a flavour stage
# (for example openjdk-21-jdk, the Android SDK, or Rust) on top of this base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/runner \
  && cd /opt/runner \
  && npm init -y >/dev/null \
  && npm install --no-audit --no-fund --omit=dev "@opencode/sdk@${OPENCODE_SDK_VERSION}"

# The turn runs as the orchestrator's uid/gid with HOME=/tmp; the workspace is
# mounted at its host path and set as the working directory at run time.
WORKDIR /workspace

# Rust flavour, for https://github.com/wuan/bo-srv-rs and other Rust
# repositories: rustc/cargo (stable, with clippy and rustfmt) plus the native
# build dependencies bo-srv-rs's CI installs (build-essential, cmake,
# pkg-config). Its HTTP client uses rustls-tls, so no OpenSSL development package
# is needed.
FROM base AS rust

# Install the toolchain into /usr/local (not the build user's $HOME) so a
# non-root turn can execute it, and keep the toolchain and the cargo registry
# cache writable by any uid the orchestrator may run the turn as.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake pkg-config curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh \
  && sh /tmp/rustup.sh -y --profile minimal --default-toolchain stable \
       --component clippy --component rustfmt \
  && rm -f /tmp/rustup.sh \
  && chmod -R a+rwX "$RUSTUP_HOME" "$CARGO_HOME" \
  && rustc --version && cargo --version
