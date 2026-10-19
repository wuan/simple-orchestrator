# Tasks

## 1. Answered marker

- [x] 1.1 Add `src/orchestrator/watermark.ts`: render the marker for the newest
      human review read (or none), parse it from a comment body, and derive the
      watermark from the orchestrator's comments, falling back to a comment's
      own timestamp when it carries no marker.

## 2. Engine

- [x] 2.1 Post every workflow pull request comment through one engine method
      that appends the marker for the reviews the action read, and feed the
      watermark to the decision as `lastTurnAt` in `src/orchestrator/engine.ts`.

## 3. Coverage

- [x] 3.1 Unit tests for the marker and the watermark, including legacy
      comments and a marker that records no review, in
      `src/orchestrator/watermark.test.ts`.
- [x] 3.2 Engine test: a review submitted while a revise turn runs drives the
      next turn; the review the turn read does not drive another; verify in
      `src/orchestrator/engine.test.ts`.

## 4. Documentation

- [x] 4.1 Update the README trigger rules: feedback submitted during a turn is
      answered by the next turn.

## 5. Verification

- [x] 5.1 Run `npm run verify` and confirm formatting, lint, typecheck, the unit
      and integration tests, and OpenSpec validation all pass.
