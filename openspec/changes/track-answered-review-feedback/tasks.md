# Tasks

## 1. Classify the orchestrator's own authors by identity

- [ ] 1.1 Add a shared predicate in `src/provider/reviews.ts` that is true when
      an author is flagged as a bot by the host or its login equals the
      configured bot login, and use it in `latestHumanReview`; verify
      `src/provider/reviews.test.ts` covers a configured login whose `isBot` is
      false for reviews.
- [ ] 1.2 Use the predicate for the comment watermark and the revise-round count
      in `src/orchestrator/engine.ts`, passing the bot login `drive` already
      resolves; verify `src/orchestrator/engine.test.ts` reproduces the loop
      with a non-host-flagged bot and asserts the second `drive` is idle.

## 2. Coverage

- [ ] 2.1 Engine test: a review the orchestrator has already answered (not newer
      than its last turn comment) is idle on the next poll, and a newer review
      still runs exactly one revise turn; verify in
      `src/orchestrator/engine.test.ts`.
- [ ] 2.2 Engine test: with a non-host-flagged bot, its turns still count toward
      the revise limit and reaching the limit fails the workflow as before;
      verify in `src/orchestrator/engine.test.ts`.
- [ ] 2.3 Provider test: the shared predicate recognises the configured login
      even when the host does not flag it, and leaves other human authors alone;
      verify in `src/provider/reviews.test.ts`.

## 3. Verification

- [ ] 3.1 Run `npm run verify` and confirm formatting, lint, typecheck, the unit
      and integration tests, and OpenSpec validation all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the changed `workflow-orchestration`
  requirements into `openspec/specs/workflow-orchestration/spec.md`.
