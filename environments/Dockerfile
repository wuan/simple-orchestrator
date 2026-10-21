# syntax=docker/dockerfile:1
#
# Turn environment images, one per "flavour".
#
# A flavour is a repository's toolchain installed on top of the shared `base`
# stage. The base provides the image contract the orchestrator requires
# (Node.js 24+, git, and @opencode/sdk at the orchestrator's version; see
# README.md), so that contract lives in exactly one place and every flavour
# inherits it. Add a flavour by appending a `FROM base AS <name>` stage; CI
# discovers those stages and publishes one image per stage. Keep intermediate
# stages off `base` (build from the underlying image instead) so they are not
# mistaken for a publishable flavour.
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

# git is required by the turn, and the SDK includes native modules that may need
# to compile during installation; add repository-specific toolchains in a flavour
# stage (for example openjdk-21-jdk, the Android SDK, or Rust) on top of this base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
       python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/runner \
  && cd /opt/runner \
  && npm init -y >/dev/null \
  && npm pkg set type=module >/dev/null \
  && npm install --no-audit --no-fund --omit=dev "@opencode/sdk@${OPENCODE_SDK_VERSION}"

# The turn runs as the orchestrator's uid/gid with HOME=/tmp; the workspace is
# mounted at its host path and set as the working directory at run time.
WORKDIR /workspace

# Node flavour: the shared base published as an image of its own, for a
# repository whose toolchain needs nothing beyond the image contract (Node.js
# 24+, git, and the matching @opencode/sdk). It carries no instructions because
# it *is* the base; the stage exists so CI discovers and publishes it as
# ghcr.io/wuan/simple-orchestrator/node.
FROM base AS node

# Rust flavour, for https://github.com/wuan/bo-srv-rs and other Rust
# repositories: rustc/cargo (stable, with clippy and rustfmt) plus the native
# build dependencies a Rust dependency tree needs (build-essential, cmake,
# pkg-config, libssl-dev). libssl-dev supplies the OpenSSL headers and library
# for crates that link the system OpenSSL through native-tls (for example
# wuan/mqtt-gateway's postgres-native-tls); bo-srv-rs's rustls-tls does not use
# it.
FROM base AS rust

# Install the toolchain into /usr/local (not the build user's $HOME) so a
# non-root turn can execute it, and keep the toolchain and the cargo registry
# cache writable by any uid the orchestrator may run the turn as.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake pkg-config curl libssl-dev \
  && rm -rf /var/lib/apt/lists/* \
  && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh \
  && sh /tmp/rustup.sh -y --profile minimal --default-toolchain stable \
       --component clippy --component rustfmt \
  && rm -f /tmp/rustup.sh \
  && chmod -R a+rwX "$RUSTUP_HOME" "$CARGO_HOME" \
  && rustc --version && cargo --version

# Android flavour, for repositories that build an Android app with Gradle and
# the Android Gradle Plugin: a JDK plus the Android SDK command-line tools and
# the SDK platform, build tools, and platform tools such a build declares.
# Gradle itself comes from the repository's wrapper, so it is not installed
# here, and the SDK licences are accepted so a build needs no interactive step.
#
# platforms: linux/amd64
# Unlike node and rust, this flavour cannot run on linux/arm64: Google publishes
# the Linux Android SDK command-line tools and the build tools (aapt2) for
# x86_64 only, with no linux-arm64 classifier. The `# platforms:` line above
# names the published platform set; it defaults to linux/amd64,linux/arm64 when
# a stage has no declaration.
FROM base AS android

# Pin the toolchain versions so the build fails loudly rather than baking a
# moving target; raise them here without touching the workflow or the specs.
ARG ANDROID_CMDLINE_TOOLS_VERSION=13114758
ARG ANDROID_COMPILE_SDK=35
ARG ANDROID_BUILD_TOOLS_VERSION=35.0.0

# Install into /opt/android-sdk (not the build user's $HOME) so a non-root turn
# can execute the SDK, and expose it through the variables a Gradle Android
# build reads. cmdline-tools/latest/bin holds sdkmanager; platform-tools holds
# adb.
ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jdk unzip curl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p "$ANDROID_HOME/cmdline-tools" \
  && curl -fsSL -o /tmp/cmdline-tools.zip \
       "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_VERSION}_latest.zip" \
  && unzip -q /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools" \
  && rm -f /tmp/cmdline-tools.zip \
  && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" \
  && yes | sdkmanager --licenses >/dev/null \
  && sdkmanager --install \
       "platform-tools" \
       "platforms;android-${ANDROID_COMPILE_SDK}" \
       "build-tools;${ANDROID_BUILD_TOOLS_VERSION}" \
  && chmod -R a+rwX "$ANDROID_HOME" \
  && java -version \
  && sdkmanager --version
