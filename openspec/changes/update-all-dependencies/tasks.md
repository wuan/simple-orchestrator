# Tasks

## 1. Refresh the npm dependencies

- [ ] 1.1 In `package.json`, raise `@opencode/sdk` to `^2.2.5`, `vitest` to `^5.1.0`, and `@vitest/coverage-v8` to `^5.1.0`, leaving every already-current range untouched; run `npm install` and verify `npm outdated` no longer lists a direct dependency behind.
- [ ] 1.2 Refresh `package-lock.json` so transitive dependencies resolve to their latest in-range versions, without adding `overrides`; verify `npm ci` installs cleanly from the refreshed lockfile.
- [ ] 1.3 Run the verification gate (`npm run verify`) and confirm the format check, lint, typecheck, the unit and integration tests, and OpenSpec validation all pass with the bumped versions.
- [ ] 1.4 Run `npm audit` and record in this change any high- or critical-severity advisory that no version bump clears, so the upstream follow-up is explicit rather than silent.

## 2. Refresh the versions CI pins

- [ ] 2.1 In `.github/workflows/ci.yml`, raise the `@fission-ai/openspec` CLI from `1.14.2` to `1.16.0`; verify `openspec validate --strict --all` and `openspec validate --strict --archived` pass under the new CLI.
- [ ] 2.2 Re-check every GitHub Action referenced by `.github/workflows/*.yml` against its latest release and bump any that is behind, keeping the repository's pin style (a major tag where `ci.yml` uses one, or a full commit SHA with a trailing `# vX.Y.Z` comment where the workflows pin SHAs); verify each pinned ref still resolves.
- [ ] 2.3 Confirm the environment-image workflow still resolves the bumped `@opencode/sdk` from `package-lock.json` (the "Resolve @opencode/sdk version" step in `.github/workflows/environments.yml`) and that no `environments/Dockerfile` build argument needs to change.

## 3. Integration checks

- [ ] 3.1 Run `npm run verify` on the final tree and confirm the whole gate passes with the bumped dependencies and tool pins.
- [ ] 3.2 After the orchestrator publishes the branch, confirm the change's pull-request CI verify job is green, including the OpenSpec validation step and the dependency-review job.

## Workflow follow-up

- Archive the change after the project's review and approval requirements are satisfied.
