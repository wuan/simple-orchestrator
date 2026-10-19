# Tasks

## 1. Count propose turns

- [x] 1.1 Share the turn comment heading between `postTurn` and the revise-round
      count in `src/orchestrator/engine.ts`, and count only the orchestrator's
      comments that start with the propose turn heading, minus the initial
      turn.

## 2. Coverage

- [x] 2.1 Engine test: a workflow that reaches READY on every propose turn still
      runs `maxReviseRounds` revise turns before the next review fails it;
      verify in `src/orchestrator/engine.test.ts`.
- [x] 2.2 Engine test: orchestrator comments that are not propose turns (for
      example a failure notice) do not count toward the limit; verify in
      `src/orchestrator/engine.test.ts`.

## 3. Documentation

- [x] 3.1 Describe the corrected count in the README's revise-limit rule.

## 4. Verification

- [x] 4.1 Run `npm run verify` and confirm formatting, lint, typecheck, the unit
      and integration tests, and OpenSpec validation all pass.
