# Proposal

## Why

The project pins dependencies in several places - the npm manifest and lockfile,
the tools CI installs, and the GitHub Actions each workflow references - and
they drift behind their own releases between Dependabot bumps. Three direct npm
dependencies are already behind (`@opencode/sdk`, `vitest`, and
`@vitest/coverage-v8`), and the OpenSpec CLI the CI gate installs is behind the
latest release. Bumping them together keeps the orchestrator, its tests, and the
environment images on one current toolchain instead of landing the moves
piecemeal, and it records the dependency-update contract the repository already
depends on.

## What Changes

- Raise every direct npm dependency that is behind to its latest release - here
  `@opencode/sdk` to `^2.2.5` and `vitest` and `@vitest/coverage-v8` to
  `^5.1.0` - and refresh `package-lock.json` so transitive dependencies resolve
  to their latest in-range versions.
- Move the tool versions CI pins to their latest releases - here the
  `@fission-ai/openspec` CLI in `.github/workflows/ci.yml` - and confirm every
  GitHub Action the workflows reference is already at its latest release, so
  the pin is deliberate rather than stale.
- Confirm the environment images still resolve the bumped `@opencode/sdk` from
  `package-lock.json`, since their version is read from the lockfile and a
  mismatch fails a containerized turn at startup.
- Record the dependency-update contract as a new `dependency-maintenance`
  capability: declared dependencies and pinned tools track their latest
  releases, and a dependency change is screened for known-vulnerable versions
  before it merges.
- No runtime behavior changes: this only moves dependency and tool versions and
  the lockfile.

## Capabilities

### New Capabilities

- `dependency-maintenance`: the project keeps the dependencies and pinned tools
  it relies on at their latest releases and screens dependency changes for known
  vulnerabilities, so the toolchain does not drift behind or silently gain an
  advisory.

### Modified Capabilities

None. The versions move but no existing requirement's behavior changes, so no
existing spec is modified.

## Impact

- `package.json`, `package-lock.json` - direct and transitive versions.
- `.github/workflows/ci.yml` - the pinned `@fission-ai/openspec` CLI version.
- `.github/workflows/*.yml` - only if an action is behind its latest release;
  the pin style (major tag or full commit SHA with a trailing version comment)
  is kept.
- `environments/Dockerfile` - unchanged; its `@opencode/sdk` build argument is
  resolved from `package-lock.json` at build time.
- No source, configuration, or existing spec change.
