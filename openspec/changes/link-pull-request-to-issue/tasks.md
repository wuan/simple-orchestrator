# Tasks

## 1. Include the closing reference in the created pull request

- [ ] 1.1 In `WorkflowEngine.start` (`src/orchestrator/engine.ts`), render the
      draft pull request body as the existing short description plus a
      `Closes #<issue>` line (for example a small `pullRequestBody(issue)`
      helper); verify with a new `src/orchestrator/engine.test.ts` case asserting
      the created pull request's body contains `Closes #<issue>` for the issue
      that started the workflow
- [ ] 1.2 Confirm the reference targets the workflow's own issue and appears
      once; verify with an engine test asserting the body names the started issue
      number and contains a single closing reference
- [ ] 1.3 Update `README.md` to state that merging a workflow pull request closes
      its issue (noting the host's default-branch requirement); verify the
      documented behavior matches the engine test

## 2. Integration check

- [ ] 2.1 Run `npm run verify` and confirm format check, lint, typecheck, tests,
      and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the new requirement into
  `openspec/specs/workflow-orchestration/spec.md`.
