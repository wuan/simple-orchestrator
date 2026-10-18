# syntax=docker/dockerfile:1
#
# Example turn environment image for a containerized OpenSpec turn.
#
# An environment image provides the toolchain the agent uses inside the turn
# container. The orchestrator mounts its compiled runner read-only at
# /opt/runner/dist and resolves @opencode/sdk from /opt/runner/node_modules, so
# the image must install the SDK for its own platform at the orchestrator's
# version.
#
# Build:
#   docker build \
#     --build-arg OPENCODE_SDK_VERSION=<orchestrator @opencode/sdk version> \
#     -t openspec-agent-example examples/environment
#
# The runner is not copied here: the orchestrator supplies it as a read-only
# bind mount per turn. A turn is started with this argv (built by
# buildDockerRunArgs), where <store> and <worktree> are mounted at their
# identical host paths:
#   docker run --rm -i \
#     --volume <store>:<store> --volume <worktree>:<worktree> \
#     --volume <orchestrator-dist>:/opt/runner/dist:ro \
#     <image> node /opt/runner/dist/runner.js

FROM node:24-bookworm-slim

# git is required by the turn; add the toolchain the repository needs (for
# example openjdk-21-jdk or android-sdk) on top of this base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The orchestrator's @opencode/sdk version. The mounted runner resolves the SDK
# from here and fails fast when the installed version differs, so keep this in
# lockstep with the orchestrator's dependency.
ARG OPENCODE_SDK_VERSION=2.0.31

RUN mkdir -p /opt/runner \
  && cd /opt/runner \
  && npm init -y >/dev/null \
  && npm install --no-audit --no-fund --omit=dev "@opencode/sdk@${OPENCODE_SDK_VERSION}"

# The turn runs as the orchestrator's uid/gid with HOME=/tmp; the workspace is
# mounted at its host path and set as the working directory at run time.
WORKDIR /workspace
