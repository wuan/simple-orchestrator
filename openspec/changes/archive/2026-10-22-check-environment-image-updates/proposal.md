# Proposal

## Why

A containerized turn starts with `docker run`, which uses whatever image the
host already has for the configured reference. The published flavours advance
`latest` on every push to `main`, but a long-running orchestrator never
re-resolves that tag, so after the first pull every turn keeps running the first
image it fetched. An operator who republished a flavour (or who started the
orchestrator before the image was built) silently runs a stale image with no way
to notice from the orchestrator's output.

## What Changes

- Before starting a containerized turn, the orchestrator refreshes the
  configured environment image so the turn runs the image its reference
  currently names instead of a stale local copy. A repository tracking a mutable
  tag such as `latest` therefore picks up a newly published image without a
  manual `docker pull`.
- Add an optional `environment.pull` policy (`always` | `missing` | `never`,
  default `always`) on a repository entry and in `defaults`, so an operator can
  keep the previous behaviour (`missing`), work fully offline (`never`), or have
  the orchestrator check every turn (`always`).
- Treat an image reference that encodes a digest (`...@sha256:...`) as
  immutable: there is no newer image to find, so the orchestrator does not
  contact the registry to look for one.
- A refresh that fails (registry unreachable or unauthorized) fails the turn
  with a clear error rather than silently falling back to the cached image,
  consistent with how an unstartable image already fails a turn.
- Document the policy and the freshness behaviour in
  [`docs/configuration.md`](../../../docs/configuration.md#environment) and
  [`environments/README.md`](../../../environments/README.md).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: adds the image-refresh behavior to containerized turn
  execution - the policy applied before the container starts, the immutable
  digest case, and the failure mode.
- `orchestrator-configuration`: adds the optional `environment.pull` policy to
  the turn-environment block, its documented default, and its fail-fast
  validation.

## Impact

- `src/config/types.ts` - add `EnvironmentPull`, the `pull` field on
  `EnvironmentSpec`, and a default constant.
- `src/config/loader.ts` - parse and validate `pull` in `parseEnvironmentValues`
  and carry it through the existing `defaults` merge.
- `src/runtime/sandbox.ts` - `DockerRunOptions` gains the resolved pull policy
  and `buildDockerRunArgs` emits docker's `--pull` argument.
- `src/runtime/opencode/container-client.ts` - resolve the policy from the
  environment, defaulting and treating a digest reference as immutable, and pass
  it to `buildDockerRunArgs`.
- `src/config/loader.test.ts`, `src/runtime/opencode/container-client.test.ts` -
  cover parsing, the default, the digest case, and the emitted argv.
- `docs/configuration.md`, `environments/README.md` - document the policy and
  the refresh behaviour.
- No new dependency; Docker remains the operator-provided runtime.
