# Proposal

## Why

The `rust` turn environment is built from `node:24-bookworm-slim`, which ships
no OpenSSL development package, and the flavour deliberately omitted one on the
assumption that the project's HTTP client uses `rustls`. That assumption fails
for `wuan/mqtt-gateway`: its dependency tree pulls `native-tls` and
`postgres-native-tls`, which build `openssl-sys` against the system OpenSSL, and
turns for that repository have failed to build for want of the `openssl`/`libssl`
headers. The CI runner it is developed on (GitHub's `ubuntu-latest`) already
ships `libssl-dev`, so the crate builds in CI but fails inside a turn, and a turn
cannot install packages to recover. The turn image should be at least as capable
as the CI environment it stands in for.

## What Changes

- Install `libssl-dev` in the `rust` stage of `environments/Dockerfile`,
  alongside the existing `build-essential`, `cmake`, and `pkg-config` native
  build dependencies, so a crate that links the system OpenSSL compiles.
- Correct the Dockerfile comment that claims no OpenSSL development package is
  needed, and note the package in the `environments/README.md` flavour table and
  Rust prose.
- Extend the environment-image invariant test so the `rust` stage's `libssl-dev`
  dependency cannot be dropped silently.

Out of scope: installing OpenSSL in the shared `base` (it would leak into the
`node` flavour), vendoring OpenSSL per crate, and any change to the other
flavours, the published flavour set, or the SDK pinning.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `environment-images`: adds a requirement that the `rust` flavour provides the
  native build dependencies a Rust dependency tree needs, including the OpenSSL
  development headers, so such a crate builds inside a turn.

## Impact

- `environments/Dockerfile` - add `libssl-dev` to the `rust` stage's
  `apt-get install` and fix the OpenSSL comment.
- `environments/README.md` - list `libssl-dev` in the Rust flavour's toolchain
  and prose.
- `src/runtime/opencode/environments.test.ts` - assert the `rust` stage installs
  `libssl-dev`.
- No runtime or configuration change: the `node` flavour and the image contract
  are untouched, and the published `rust` image gains one package.
