# Tasks

## 1. Summarize the change in the pull request title

- [ ] 1.1 In `WorkflowEngine.start` (`src/orchestrator/engine.ts`), render the
      draft pull request title as ``OpenSpec change for issue #<n>: <issue
      title>`` (for example a `pullRequestTitle(issue)` helper beside
      `pullRequestBody`); verify with a new `src/orchestrator/engine.test.ts`
      case asserting the created pull request's title includes the issue's title
      and still names the started issue number

## 2. Drop the closing line from the pull request body

- [ ] 2.1 In `WorkflowEngine.start`, reduce `pullRequestBody` to the short
      description ``Workflow for issue #<n>.``; verify with an engine test
      asserting the created pull request's body contains the description and no
      `Closes #<n>`
- [ ] 2.2 Replace the engine tests that assert the closing reference
      (`includes a closing reference to the issue in the created pull request`,
      `references only the started issue, once`) with assertions for the new
      title and body; verify `npm test` passes

## 3. Documentation

- [ ] 3.1 Update `README.md` (the "How it works" bullet about merging the pull
      request) to describe the summarizing title and the body without a closing
      keyword, and to stop claiming that merging closes the issue; verify the
      documented behavior matches the engine tests

## 4. Integration check

- [ ] 4.1 Run `npm run verify` and confirm format check, lint, typecheck, tests,
      and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the modified requirement into
  `openspec/specs/workflow-orchestration/spec.md`.
