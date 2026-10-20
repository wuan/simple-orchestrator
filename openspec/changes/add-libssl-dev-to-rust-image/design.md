# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `environments/Dockerfile` defines the `rust` flavour as `FROM base AS rust` on
  a shared `base` (`node:24-bookworm-slim` plus git and the pinned
  `@opencode/sdk`). Its single `apt-get install` already pulls `build-essential`,
  `cmake`, `pkg-config`, and `curl` before installing the Rust toolchain, so
  adding a package is one entry in that list.
- CI discovers the `FROM base AS <name>` stages and publishes one multi-platform
  image per flavour, so any package must exist for `linux/amd64` and
  `linux/arm64` in Debian bookworm.
- Both the Dockerfile comment and `environments/README.md` currently state that
  no OpenSSL development package is needed, so the documentation has to change
  with the image.
- `src/runtime/opencode/environments.test.ts` asserts the flavour set, the
  shared base, and the multi-platform build from the Dockerfile text, and is the
  natural place to pin the package.

## Goals / Non-Goals

**Goals:**

- Give the `rust` image the OpenSSL development headers and library so a Rust
  dependency tree that links the system OpenSSL builds in a turn.
- Keep the `rust` flavour on the shared `base`, the flavour set, the SDK pin, and
  the multi-platform publish unchanged.
- Keep the Dockerfile comment, the README, and the invariant test consistent with
  the image.

**Non-Goals:**

- Adding OpenSSL to `base` or to any other flavour.
- Vendoring OpenSSL per crate or changing the Rust toolchain profile.
- Changing the image contract, the workflow, or the supported platforms.

## Decisions

### Add `libssl-dev` to the Rust stage's existing apt install

Append `libssl-dev` to the `rust` stage's `apt-get install` list. It is the
Debian development package for the system OpenSSL, so it supplies both the
headers `openssl-sys` looks for via `pkg-config` and the shared library the
linker needs, and it is available for both published architectures. Alternatives
considered: install it in `base` (rejected: it would leak into the `node`
flavour and the deliberate "contract lives in one place" split); rely on a
crate's `vendored` feature (rejected: a per-project choice, slower to build, and
not the image's job); switch to a fuller base image (rejected: larger and it
still does not guarantee the package).

### Keep the package scoped to the Rust flavour

Only the `rust` stage changes. A Rust dependency tree is the only thing that
needs the headers, and keeping the package out of the shared stage keeps the
`node` image and the image contract as they are.

### Pin the package in the invariant test

Extend `src/runtime/opencode/environments.test.ts` to assert the `rust` stage
installs `libssl-dev`, matching the existing Dockerfile-text assertions. This
makes a silent removal fail the test rather than a later turn, and it costs no
network or container build.

## Risks / Trade-offs

- [The image grows] -> `libssl-dev` is small and the `rust` flavour already
  installs `build-essential`, so the added layers are minimal.
- [`libssl-dev` is unavailable for arm64] -> Debian bookworm ships it for both
  published architectures and the multi-platform build fails loudly if not.
- [Documentation drifts from the image again] -> the README names the package
  and the invariant test asserts it in the Dockerfile.
- [The package is added for a dependency that later moves to rustls] -> the
  package is harmless and removes a whole failure mode; drop it in its own
  change if it becomes provably unnecessary.

## Migration Plan

None. The change is additive to the `rust` image and has no runtime or
configuration effect. It is picked up on the next `rust:latest` pull after the
change lands on the default branch. Rollback removes the package and reverts the
documentation and test.

## Open Questions

None.
