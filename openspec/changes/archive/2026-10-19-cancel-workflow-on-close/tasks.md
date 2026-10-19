# Tasks

## 1. Engine

- [x] 1.1 Route every cancellation in `src/orchestrator/engine.ts` through one
      method that clears the phase labels, posts the comment, and, when the pull
      request was closed without merge, removes the trigger label from the issue.
- [x] 1.2 In `start`, cancel a closed pull request that still carries a phase
      label other than `done` and start nothing.

## 2. Poller

- [x] 2.1 Report a cancellation found while starting in the verbose poll output
      in `src/orchestrator/poller.ts`.

## 3. Coverage

- [x] 3.1 Engine tests: closing an in-flight pull request cancels and removes
      the trigger label; `start` cancels a closed `failed` pull request instead
      of starting; a cancelled closed pull request still allows a new start.
- [x] 3.2 Poller test: closing the pull request does not start a new workflow
      in the same or a later poll, and re-adding the label starts one.

## 4. Documentation

- [x] 4.1 Update the README's "Leaving the happy path" and transition tables.

## 5. Verification

- [x] 5.1 Run `npm run verify` and confirm formatting, lint, typecheck, the unit
      and integration tests, and OpenSpec validation all pass.
