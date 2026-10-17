# Tasks

## 1. Expose the workflow branch tip from the sandbox

- [x] 1.1 Add a `head(): Promise<string>` accessor to `SandboxHandle` in
      `src/runtime/sandbox.ts` and implement it in `WorktreeSandbox` as
      `git -C <workspace> rev-parse HEAD`; verify `src/runtime/sandbox.test.ts`
      covers a provisioned workspace returning a tip that changes after a commit
- [x] 1.2 Implement `head()` in `src/orchestrator/testing/fake-sandbox.ts` as a
      scriptable value (like `baseIntegrationResults`) so a test can model a
      turn that leaves the tip unchanged; verify the engine test suite still
      compiles and passes

## 2. Fail a no-op propose turn

- [x] 2.1 In `WorkflowEngine.runTurn`, capture the branch tip before and after
      `runtime.run` and throw a new `NoProgressError` when the skill is
      `propose`, the turn has no review trigger, and the tip is unchanged, so
      the existing catch marks the workflow `failed`; verify with a new
      `src/orchestrator/engine.test.ts` case asserting the `failed` label and a
      failure comment
- [x] 2.2 Confirm the check counts only the turn's own commits: it does not fire
      when the tip changed, and it does not treat the base-integration merge
      alone as turn progress; confirm it does not fire for a review-driven no-op
      revise turn and assert the phase is unchanged there; verify with engine
      test cases
- [x] 2.3 Report the stalled turn in the verbose diagnostics (`logger`) with the
      reason the turn failed; verify an engine test asserts the diagnostic is
      emitted

## 3. Integration and documentation

- [x] 3.1 Add a poller-level test showing a `proposing` workflow whose propose
      turn produced no change is marked `failed` on the first cycle and recovered
      on the next, exactly once per process; verify with
      `src/orchestrator/poller.test.ts`
- [x] 3.2 Update `README.md` (and the relevant requirement text if needed) to
      describe that a propose turn that produces no change fails the workflow
      instead of idling; verify the documented behavior matches the tests
- [x] 3.3 Run `npm run verify` and confirm the full gate passes

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the new requirement into
  `openspec/specs/workflow-orchestration/spec.md`.
