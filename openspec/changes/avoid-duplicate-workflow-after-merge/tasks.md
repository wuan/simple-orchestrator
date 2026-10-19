# Tasks

## 1. Refuse to start a workflow resolved by a merged pull request

- [ ] 1.1 In `src/orchestrator/engine.ts`, extend `StartResult` with an optional
      `resolvedBy?: ProviderPullRequest` and make `WorkflowEngine.start`, after
      the open-pull-request check, return `{ started: false, resolvedBy }` when
      an associated pull request has `state === 'merged'`, without creating a
      pull request or running a turn; verify with an engine test in
      `src/orchestrator/engine.test.ts` that a seeded merged pull request for the
      issue leaves the pull request count and the runtime request count
      unchanged.
- [ ] 1.2 Add an engine test that a pull request closed without being merged
      does not block a start (a new workflow is created); verify in
      `src/orchestrator/engine.test.ts`.
- [ ] 1.3 In `src/orchestrator/poller.ts`, log
      `issue #<n> was resolved by merged pull request #<m>; not starting a workflow`
      when `start` returns `resolvedBy`; verify with a poller test in
      `src/orchestrator/poller.test.ts` that a trigger-labeled issue whose
      workflow pull request was merged is not started and runs no turn, and that
      the message is reported when a logger is injected.

## 2. End-to-end coverage of the merge race

- [ ] 2.1 Add an e2e test in `src/orchestrator/e2e.test.ts` that drives a
      workflow to `implementing`, marks its pull request `merged` while the issue
      stays labeled and open, and asserts the next poll marks the workflow `done`
      and starts no second workflow (the runtime sees no new propose turn and the
      issue still has exactly one pull request); verify the test passes.

## 3. Verification

- [ ] 3.1 Run `npm run verify` and confirm formatting, lint, typecheck, the unit
      and integration tests, and OpenSpec validation all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the new `workflow-orchestration` requirement
  into `openspec/specs/workflow-orchestration/spec.md`.
