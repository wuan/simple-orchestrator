# Tasks

## 1. Fail a no-op apply turn

- [x] 1.1 In `src/orchestrator/engine.ts`, extend the no-progress check after a
      turn so an apply turn whose workflow branch tip is unchanged fails the
      workflow, while a propose turn without a triggering review keeps failing
      and a review-driven revise turn may still commit nothing; verify with
      `src/orchestrator/engine.test.ts` tests for an apply turn that commits
      nothing (failed, not published, still draft) and one that commits
      (published, ready for review, implementing).
- [x] 1.2 Generalize `NoProgressError` so its message names the skill that
      produced no change, and confirm the propose failure test still asserts the
      text.
- [x] 1.3 Update the IMPLEMENTING apply-turn failure row in `README.md` to
      include a turn that commits nothing.

## 2. Verification

- [x] 2.1 Run `npm run verify` and confirm it passes.
