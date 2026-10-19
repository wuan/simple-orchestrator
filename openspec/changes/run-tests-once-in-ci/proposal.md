# Proposal

## Why

The CI `verify` job runs the test suite twice: `npm run verify` ends with
`npm test` (`vitest run`), and a later `npm run test:coverage` step runs
`vitest run --coverage` again. Vitest's GitHub Actions reporter appends a
"Vitest Test Report" job summary on every run, so the job summary shows that
same entry twice and the suite is exercised twice for no extra signal (issue
#34).

## What Changes

- Run the test suite exactly once in the CI `verify` job. The single run
  produces the coverage data (`coverage/lcov.info`) the SonarCloud step
  consumes, so the separate `npm run test:coverage` step is removed.
- Keep the local verification gate coverage-free by default, so the pre-commit
  hook stays fast. Coverage is collected only when the environment requests it,
  which CI sets and `vitest.config.ts` reads to enable the coverage reporter.
- Keep `npm run test:coverage` for ad-hoc local coverage collection; the CLI
  flag still enables coverage over the config's default.
- The verification gate itself is unchanged: the same format, lint, typecheck,
  test, and OpenSpec steps run in the hook and in CI.

## Capabilities

### New Capabilities

- `continuous-integration`: the CI `verify` job runs the project's verification
  gate, exercises the test suite exactly once per run, publishes exactly one
  test report in its job summary, and produces on that same run the coverage
  data the code-analysis step consumes.

### Modified Capabilities

None.

## Impact

- `.github/workflows/ci.yml` - the `verify` job's steps and environment.
- `vitest.config.ts` - the coverage reporter is enabled only on request.
- `README.md` - how the gate, coverage, and CI relate.
- No runtime behavior, configuration, or dependency changes, and no change to
  what the gate checks.
