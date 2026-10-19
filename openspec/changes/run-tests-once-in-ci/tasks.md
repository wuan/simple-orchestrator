# Tasks

## 1. Collect coverage on the gate's test run

- [ ] 1.1 Gate the Vitest coverage reporter on an environment request in
      `vitest.config.ts` (`coverage.enabled: process.env.COVERAGE === 'true'`);
      verify `COVERAGE=true npm test` writes `coverage/lcov.info` and a plain
      `npm test` does not collect coverage.
- [ ] 1.2 Keep `npm run test:coverage` working for ad-hoc local coverage (the
      CLI `--coverage` flag overrides the config default); verify it writes
      `coverage/lcov.info`.

## 2. Run the suite once in CI

- [ ] 2.1 Set `COVERAGE: 'true'` on the `npm run verify` step in
      `.github/workflows/ci.yml` and remove the separate `npm run test:coverage`
      step; verify the file still parses as YAML and no longer mentions
      `test:coverage`.
- [ ] 2.2 Update the "Testing" section of `README.md` to state that the gate
      runs the suite once in CI with coverage and that `npm run test:coverage`
      collects coverage locally; verify the section describes the workflow as
      written.

## 3. Verification

- [ ] 3.1 Run `npm run verify` and confirm the format check, lint, typecheck,
      the unit and integration tests, and strict OpenSpec validation all pass.
- [ ] 3.2 Verify `openspec validate --strict run-tests-once-in-ci` passes and
      `openspec status --change run-tests-once-in-ci` reports every artifact
      `done`, so the objective readiness predicate can mark the change READY.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the `continuous-integration` requirements
  into `openspec/specs/continuous-integration/spec.md`.
