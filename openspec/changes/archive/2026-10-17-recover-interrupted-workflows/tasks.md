# Tasks

## 1. Adopt phase-less open pull requests

- [x] 1.1 Track recovered pull requests in `WorkflowEngine` and add a `recover`
      method that re-reads the transcript and runs a propose turn once per
      pull request per process, and verify a unit test shows the second call is
      a no-op
- [x] 1.2 In `Poller.pollOnce`, when a trigger-labeled issue has an open pull
      request whose phase is absent or `failed`, call `engine.recover` instead of
      skipping; leave in-flight and `done` pull requests alone, and verify unit
      tests cover each case
- [x] 1.3 Add recovered issues to `PollReport` and log the count in `src/index.ts`,
      and verify the CLI test and poller tests still pass

## 2. Verification

- [x] 2.1 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the added capability requirement appears in
  the main specs.
