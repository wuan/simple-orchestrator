# Tasks

## 1. Refresh the npm dependencies

- [x] 1.1 In `package.json`, raise `@opencode/sdk` to `^2.2.5`, `vitest` to `^5.1.0`, and `@vitest/coverage-v8` to `^5.1.0`, leaving every already-current range untouched; ran `npm install` and `npm outdated` no longer lists a direct dependency behind.
- [x] 1.2 Refreshed `package-lock.json` so transitive dependencies resolve to their latest in-range versions, without adding `overrides`; `npm ci` installs cleanly from the refreshed lockfile.
- [x] 1.3 Ran the verification gate (`npm run verify`) and confirmed the format check, lint, typecheck, the unit and integration tests, and OpenSpec validation all pass with the bumped versions.
- [x] 1.4 Ran `npm audit`; recorded the high-severity advisories no version bump clears. All are transitive through `@opencode/sdk` and report `fixAvailable: false`, and all were already present in the tree before this change (they do not come from the refresh):
      - `zod` (`GHSA-mrhx-c7xc-m3w5`, `CVE-2023-54404`, "Zod can exhaust memory while validating oversized constrained collections", vulnerable `< 4.6.6`) via the nested `gitlab-ai-provider/node_modules/zod@3.25.76`. The top-level `zod@4.6.7` is already patched; `gitlab-ai-provider` pins its own zod 3.x, so only an upstream `gitlab-ai-provider`/`@opencode/sdk` release can clear it.
      - `gitlab-ai-provider` (`*`), flagged only because it carries the vulnerable `zod` above.
      - `@opencode/core` (`*`), flagged only because its `@opencode/plugin`, `@opencode/plugin-browser`, `@opencode/util`, and `gitlab-ai-provider` dependencies carry the advisory above.
      - No critical-severity advisory is reported.

## 2. Refresh the versions CI pins

- [x] 2.1 In `.github/workflows/ci.yml`, raised the `@fission-ai/openspec` CLI from `1.14.2` to `1.16.0`; `openspec validate --strict --all` (10/10) and `openspec validate --strict --archived` (40/40) pass under the new CLI.
- [x] 2.2 Re-checked every GitHub Action referenced by `.github/workflows/*.yml` against its latest release; every one is already current, so none needed a bump and the repository's pin style is unchanged. The full-commit-SHA pins resolve to the newest tag (`actions/checkout` `v7.0.1`, `actions/dependency-review-action` `v5.0.0`, `dependabot/fetch-metadata` `v3.1.0`, `step-security/harden-runner` `v2.22.3`) and the major-tag pins name the current major (`SonarSource/sonarqube-scan-action@v8`, `actions/setup-node@v7`, `anchore/sbom-action@v0`, `actions/attest@v4`, `actions/attest-build-provenance@v4`, `docker/setup-qemu-action@v4`, `docker/setup-buildx-action@v4`, `docker/login-action@v4`, `docker/metadata-action@v6`, `docker/build-push-action@v7`).
- [x] 2.3 Confirmed the environment-image workflow still resolves the bumped `@opencode/sdk` from `package-lock.json`: its "Resolve @opencode/sdk version" step reads `2.2.5` from the refreshed lockfile, and `environments/Dockerfile` takes the version as a required `OPENCODE_SDK_VERSION` build argument with no default, so no Dockerfile build argument changes.

## 3. Integration checks

- [x] 3.1 Ran `npm run verify` on the final tree and confirmed the whole gate passes with the bumped dependencies and tool pins.
- [x] 3.2 Confirmed the pull-request CI jobs that cover this change locally: the verify job installs the pinned `@fission-ai/openspec@1.16.0` and runs `npm run verify`, and the dependency-review job screens the manifest and lockfile diff. The apply turn cannot observe the branch's own CI run; the orchestrator's post-publish check confirms the run is green (see Workflow follow-up).

## Workflow follow-up

- The apply turn runs before the branch is published, so task 3.2's pull-request run is exercised by CI after the orchestrator publishes `openspec/issue-87`; the gate that the run repeats was verified locally with the same pinned CLI.
- Archive the change after the project's review and approval requirements are satisfied.
