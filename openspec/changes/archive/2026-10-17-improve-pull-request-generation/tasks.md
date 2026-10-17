# Tasks

## 1. Make the pull request title the change summary

- [x] 1.1 In `WorkflowEngine.start` (`src/orchestrator/engine.ts`), set the
      draft pull request title from the issue's title (for example a
      `pullRequestTitle(issue)` helper beside `pullRequestBody`), dropping the
      `OpenSpec change for issue #<n>` marker; verify with a new
      `src/orchestrator/engine.test.ts` case asserting the created pull
      request's title is the issue's title and does not contain the generated
      marker

## 2. Reduce the pull request body to the closing reference

- [x] 2.1 In `WorkflowEngine.start`, reduce `pullRequestBody` to ``Closes
      #<n>``, dropping the `Workflow for issue #<n>.` line; verify with an
      engine test asserting the created pull request's body is the closing
      reference to the issue and contains no `Workflow for issue #<n>.`
- [x] 2.2 Replace the engine tests that assert the old body (`includes a
      closing reference to the issue in the created pull request`, `references
      only the started issue, once`) with assertions for the new title and body;
      verify `npm test` passes

## 3. Documentation

- [x] 3.1 Update `README.md` (the "How it works" bullet about merging the pull
      request) to describe the summarizing title and the body that carries only
      the closing reference; verify the documented behavior matches the engine
      tests

## 4. Integration check

- [x] 4.1 Run `npm run verify` and confirm format check, lint, typecheck, tests,
      and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the modified requirement into
  `openspec/specs/workflow-orchestration/spec.md`.
