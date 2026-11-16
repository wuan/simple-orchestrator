# Tasks

## 1. Readiness predicate

- [x] 1.1 In `src/orchestrator/readiness.ts`, count an artifact as satisfied when its status is `done` or `skipped`, keep every other status unfinished, and update the contract comment and log reason to reflect the accepted states; verify `npm test -- src/orchestrator/readiness.test.ts` passes after the new case is added.
- [x] 1.2 Add a `readiness.test.ts` case for a change whose `specs` artifact is `skipped` while the others are `done`, and expect `ready: true`; verify the test fails if `skipped` is removed from the accepted statuses.
- [x] 1.3 Add an engine test that starts a workflow whose change has a `skipped` artifact, then approves it and expects an `apply` turn, so the READY phase and the approval gate are covered together; verify the test fails under the old predicate.
- [x] 1.4 Run `npm test -- src/orchestrator/readiness.test.ts src/orchestrator/engine.test.ts` and verify both suites pass.

## 2. Documentation

- [x] 2.1 Update the READY description in `README.md` to say readiness accepts artifacts reported as `done` or `skipped`, naming `skip_specs` as the case that reports `skipped`; verify the paragraph still describes the CLI source of truth and strict validation.

## 3. Integration verification

- [x] 3.1 Run `npm run verify` and verify formatting, lint, typecheck, the unit and integration tests, and `openspec validate --strict` pass.

## Workflow follow-up

- Archive this change after review and merge so the modified readiness requirement lands in `openspec/specs/workflow-orchestration/spec.md`.
