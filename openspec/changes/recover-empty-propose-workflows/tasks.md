# Tasks

## 1. Expose whether the workflow branch carries a proposal

- [ ] 1.1 Add `hasChanges(): Promise<boolean>` to `SandboxHandle` in
      `src/runtime/sandbox.ts` and implement it in `WorktreeSandbox` as `git
      diff --quiet origin/<base> HEAD`; verify `src/runtime/sandbox.test.ts`
      covers a branch that differs from the base and a branch that does not
- [ ] 1.2 Implement `hasChanges()` in `src/orchestrator/testing/fake-sandbox.ts`
      as a scriptable value (like `baseIntegrationResults`); verify the engine
      test suite still compiles and passes

## 2. Recover a proposing workflow with no proposal

- [ ] 2.1 Add `WorkflowEngine.recoverStalled` in `src/orchestrator/engine.ts`:
      provision one workspace, run the propose turn when the branch has no
      change or the base is unintegrated, and leave a branch that already
      carries a change alone; verify with new `src/orchestrator/engine.test.ts`
      cases
- [ ] 2.2 Let `runTurn` accept a workspace provisioned by the caller so a
      stalled recovery provisions only once, and keep the turn responsible for
      disposing it; verify the existing engine tests still pass
- [ ] 2.3 Record the pull request in the existing `recovered` set before the
      check so the stall is retried at most once per process; verify with an
      engine test

## 3. Wire the poller and document

- [ ] 3.1 In `src/orchestrator/poller.ts`, invoke `recoverStalled` for an open
      pull request in the `proposing` phase; verify with new
      `src/orchestrator/poller.test.ts` cases: a stalled workflow is recovered
      once per process, a still-empty recovery is marked `failed` and reported,
      and a branch with a proposal is left to review
- [ ] 3.2 Update `README.md` to describe that a `proposing` workflow without a
      proposal is recovered rather than idling; verify the documented behavior
      matches the tests
- [ ] 3.3 Run `npm run verify` and confirm the full gate passes

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the modified requirement into
  `openspec/specs/workflow-orchestration/spec.md`.
