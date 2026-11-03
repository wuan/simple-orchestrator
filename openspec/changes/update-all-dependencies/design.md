# Design

## Context

See `proposal.md` - Why. At the time of writing, `npm outdated` reports three
direct dependencies behind their latest release:

| Dependency             | In `package.json` | Latest   |
| ---------------------- | ----------------- | -------- |
| `@opencode/sdk`        | `^2.2.4`          | `2.2.5`  |
| `vitest`               | `^5.0.5`          | `5.1.0`  |
| `@vitest/coverage-v8`  | `^5.0.4`          | `5.1.0`  |

Every other declared dependency is already at its latest release, and the
GitHub Actions the workflows reference are already at their latest releases
(each pinned full commit SHA resolves to the newest tag, and the workflows that
use major tags use the current major). The one tool CI installs, the
`@fission-ai/openspec` CLI in `.github/workflows/ci.yml`, is pinned at `1.14.2`
while `1.16.0` is the latest release; the full gate stays green under `1.16.0`.

Two repository precedents shape this change. First, repository-wide concerns
have been recorded as capabilities before (`code-quality`,
`project-documentation`, `continuous-integration`). Second, the orchestrator's
readiness predicate marks a change READY only when every artifact reports
`done`; a change that sets `skip_specs: true` reports `specs` as `skipped`,
never `done`, so a zero-delta change can never reach READY (see
`resolve-sonarcloud-findings` and `render-diagrams-with-mermaid`). A spec
artifact is therefore mandatory even though no runtime behavior changes.

## Goals / Non-Goals

**Goals:**

- Bring every dependency and pinned tool the project declares up to its latest
  release in one change, and leave `npm outdated` clean for direct
  dependencies.
- Keep the environment-image contract intact: the image still installs exactly
  the `@opencode/sdk` version the lockfile resolves.
- State the dependency-update contract as a durable capability so future
  refreshes have a written home instead of an ad-hoc bump.

**Non-Goals:**

- Changing npm's declared version ranges beyond the current caret ranges. This
  is a refresh, not a move to a new major line.
- Forcing transitive dependencies to a fixed version with `package.json`
  `overrides`. Advisories that only an upstream release can clear are recorded
  rather than pinned around.
- Refreshing the environment images' deliberately pinned toolchain - the
  `node:24-bookworm-slim` base, and the Android SDK, PlatformIO, and
  clang-format versions in `environments/Dockerfile`. Those are pinned so a
  build fails loudly rather than baking a moving target, and a bump is its own
  change.

## Decisions

### Decision: record the contract as a new `dependency-maintenance` capability

The dependency-update concern is durable and testable - a direct dependency
behind its latest release, a CI-pinned tool behind its release, and a dependency
change screened for known vulnerabilities are all observable. Recording it as a
capability follows `code-quality` and `project-documentation`, and it gives the
readiness predicate a `done` specs artifact, which `skip_specs` cannot produce.
Alternative: `skip_specs: true` (rejected: the approval gate can never open for
the change). Alternative: modify `continuous-integration` (rejected: the
requirement spans the manifest, the workflows, and the images, not the verify
job's test execution, and would misplace the concern).

### Decision: bump only what is behind, and keep the caret ranges

Only `@opencode/sdk` (patch), `vitest` (minor), and `@vitest/coverage-v8`
(minor) are behind, so only their ranges change in `package.json`; the lockfile
is refreshed so transitives reach their latest in-range versions. The existing
caret ranges already admit these releases, so no major line moves and no
dependency's public API is expected to break. Alternative: a blanket rewrite of
every version (rejected: needless churn and a larger review surface for no
version change). Alternative: move to the newest majors where they exist
(rejected: out of scope, and no major is due here).

### Decision: refresh the lockfile rather than force transitive overrides

Refreshing the lockfile picks up the latest in-range fixes without asserting a
transitive version the direct dependency did not choose. Where `npm audit`
still reports a high- or critical-severity advisory only an upstream release can
clear, the change records it instead of pinning an `overrides` entry, which
would mask the drift and risk an incompatible tree. Alternative: add
`overrides` for the flagged transitives (rejected: the tree's owners should
choose those versions; a forced pin here is a separate, reviewable decision).

### Decision: verify under the target OpenSpec CLI before pinning it

The CI gate runs `openspec validate --strict`, so the CLI is part of the gate's
behavior. The proposed pin (`1.16.0`) is validated against the repository's
specs and archived changes before the change lands - the strict gate stays green
under it - so the pin does not silently change what the gate accepts.
Alternative: leave the pin and update it separately (rejected: the issue asks
for all dependencies).

## Risks / Trade-offs

- [A minor `vitest` bump changes test behavior] -> `@opencode/sdk` and the
  suite are already exercised by `npm run verify`; a regression fails the gate
  before the change is approved.
- [The `@opencode/sdk` patch changes the runner's protocol] -> the SDK version
  is read from `package-lock.json` by both the orchestrator and the image build,
  so a containerized turn fails fast on a mismatch rather than at runtime; a
  Docker smoke test covers the container path where Docker is available.
- [A remaining transitive advisory cannot be cleared by a version bump] ->
  `npm audit` is run last and any such advisory is recorded in the change, so
  the gap is explicit and can be handled upstream rather than hidden.

## Open Questions

- Should the environment images' deliberately pinned toolchain (the
  `node:24-bookworm-slim` base, and the Android SDK, PlatformIO, and
  clang-format versions) also be refreshed? This change treats them as out of
  scope because they are pinned to fail loudly, but a follow-up change can
  revisit them without changing this one.
