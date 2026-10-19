# Design

## Context

See `proposal.md` - Why. The current state that shapes the approach:

- `.github/workflows/ci.yml`'s `verify` job runs `npm run verify`, whose test
  step is `npm test` (`vitest run`), then a separate `npm run test:coverage`
  (`vitest run --coverage`) step. Coverage is separate because the gate
  deliberately omits it to keep the pre-commit hook fast.
- Vitest auto-enables its GitHub Actions reporter when `GITHUB_ACTIONS === 'true'`
  and, by default, appends a `Vitest Test Report` job summary on every run, so
  the two runs append two identical entries to the job's summary.
- The SonarCloud step reads `coverage/lcov.info`; the coverage reporter is
  configured in `vitest.config.ts` (`provider: 'v8'`, `reporter: ['text','lcov']`).
- The local pre-commit hook and CI both invoke the same `npm run verify`.

## Goals / Non-Goals

**Goals:**

- One Vitest run per `verify` job, so the job summary carries one test report.
- Coverage still produced for the analysis step, on that same run.
- The coverage-free local gate preserved.

**Non-Goals:**

- Changing what the gate checks (format, lint, typecheck, tests, OpenSpec).
- Changing the analysis step, its coverage threshold, or its report paths.
- Suppressing or renaming the reporter's summary to hide a duplicate run.

## Decisions

### Enable coverage on the gate's existing test run, keyed on the environment

Set `coverage.enabled` in `vitest.config.ts` from a `COVERAGE` environment
variable (`process.env.COVERAGE === 'true'`) and set `COVERAGE: 'true'` on the
`npm run verify` step in CI, replacing the separate `test:coverage` step. The
gate keeps its existing test step; only whether that step collects coverage
changes.

- Alternative: make the gate always collect coverage and delete
  `test:coverage`. Rejected: the pre-commit hook runs `npm run verify` on every
  commit, and coverage is CI-only today, so this would slow the local gate for
  no benefit while changing its behavior everywhere.
- Alternative: keep two test runs and give the coverage run a distinct summary
  title. Rejected: it hides the duplicate entry but still runs the suite twice,
  paying the cost without adding signal.
- Alternative: a separate `verify:coverage` script that repeats the gate
  composition. Rejected: it duplicates the gate definition, which the README
  says is the same in the hook and in CI.

### Keep `npm run test:coverage` for ad-hoc local coverage

`vitest run --coverage` still enables coverage over the config's `false`
default, so local coverage collection needs no new command and no `COVERAGE`
assignment, which is not portable across shells.

### Record the CI behavior as a new `continuous-integration` capability

The objective readiness predicate marks a change READY only when its `specs`
artifact is `done`, and a change that sets `skip_specs: true` reports `specs` as
`skipped`, never `done`, so a zero-delta change cannot reach READY. State the
CI verify job's behavior as a real capability instead. This follows
`project-documentation`, which specifies a repository concern the same way.

## Risks / Trade-offs

- [A future CI invocation forgets `COVERAGE`, so SonarCloud stops receiving
  coverage] -> the flag sits on the step it configures and the analysis step
  still runs; the missing report is visible on the SonarCloud dashboard.
- [The `COVERAGE` name collides with a future Vitest option] -> it is a project
  variable read only by `vitest.config.ts`, next to the coverage block it gates.
- [Coverage slows the run when requested] -> it is requested only on the CI gate
  run, not on the local hook.

## Migration Plan

None. A CI and configuration change with no runtime effect; it applies on the
next merge. Rollback reverts the workflow and the config.

## Open Questions

None.
