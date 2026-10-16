# Tasks

## 1. Foundation

- [x] 1.1 Select the implementation language/runtime and scaffold the service project so that build, lint, and the test runner all execute against an empty suite
- [x] 1.2 Define core domain types (normalized event set, workflow phase, turn context, structured turn result) and verify unit tests cover event/phase validity
- [x] 1.3 Implement the configuration model and loader per `orchestrator-configuration` (declarative repo list, credential references, label and interval overrides) and verify startup fails fast, naming the repo, when a credential reference is missing
- [x] 1.4 Resolve credentials from an environment variable or an external secret source (including the `gh` CLI) and verify a config that references a token never requires the secret to be inlined
- [x] 1.5 Document configuration fields, defaults, and an example in docs/configuration.md and verify the documented example parses and starts
- [x] 1.6 Implement ordered credential fallback (environment variable, then `gh auth token`) and verify startup succeeds against an authenticated `gh` with the variable unset, and fails fast naming the repository when neither source provides a token

## 2. RepoProvider

- [x] 2.1 Define the `RepoProvider` interface (issues, comments, labels, pull request/merge request, review state, clone, bot identity) and verify orchestration tests can run against a fake provider
- [x] 2.2 Implement the normalized event mapping and verify GitHub `changes_requested`/`approved` map to changes-requested/approval events
- [x] 2.3 Implement GitHub discovery of issues carrying the trigger label and verify an unlabeled issue is not returned
- [x] 2.4 Implement branch and draft pull request creation plus lifecycle label management and verify labels are set and cleared as specified
- [x] 2.5 Implement review-state reads from pull request review events with timestamps and verify the newest human review is reported while bot reviews are excluded
- [x] 2.6 Implement clone-at-branch and bot identity detection and verify bot comments and reviews are classified as non-human
- [x] 2.7 Add conditional requests, pagination, and rate-limit backoff to the direct REST transport and verify unchanged resources are skipped and a low quota threshold triggers backoff
- [x] 2.8 Publish a provider contract test suite and run it against the GitHub adapter so future providers can reuse it
- [x] 2.9 Extract a transport seam from the GitHub provider and implement a `gh` CLI transport (`gh api`) with pagination, and verify host operations execute through `gh`
- [x] 2.10 Clone the workflow branch through `gh repo clone` and verify both the clone and API calls use the operator's `gh` session when no token is configured

## 3. AgentRuntime

- [x] 3.1 Define the `AgentRuntime` interface (`run(skill, context) -> structured result`) and verify a fake runtime can drive orchestration tests
- [x] 3.2 Implement the per-turn ephemeral sandbox (container cloned at the workflow branch) and verify successive turns do not share a workspace
- [x] 3.3 Enforce least privilege (branch-only push, no default-branch write, no force-push, no merge) and verify a denied operation is rejected
- [x] 3.4 Enforce per-turn caps on agent steps, tokens, and wall-clock time and verify exceeding each limit fails the turn
- [x] 3.5 Implement the OpenCode adapter that runs the propose and apply skills and returns commits, summary, and questions, and verify a propose turn yields a change commit and an apply turn yields code plus archive

## 4. Workflow orchestration

- [x] 4.1 Implement the phase state machine and lifecycle labels (proposing/ready/implementing/done/failed) and verify each phase sets its corresponding label
- [x] 4.2 Implement the poller that starts a workflow (branch + draft PR) for a labeled issue and verify one PR per issue with no duplicates
- [x] 4.3 Implement the watermark decision function (labels plus timestamps) and verify a poll cycle with no new activity takes no action
- [x] 4.4 Implement idempotent turn dispatch that is safe across restarts and verify restarting after acting on an event does not re-run the turn
- [x] 4.5 Implement the objective readiness predicate from `openspec status --json` plus `validate --strict` and verify an agent readiness claim is ignored when the predicate fails
- [x] 4.6 Implement the approval gate with the `implementing` claim set before enqueueing apply and verify a push-dismissed approval does not re-trigger apply
- [x] 4.7 Implement the revise loop with the configured round limit and verify the limit marks the workflow failed and notifies on the pull request
- [x] 4.8 Implement transient-failure retry (once) and permanent-failure signalling and verify both paths post the correct outcome
- [x] 4.9 Implement cancellation on trigger-label removal or a closed pull request and verify no further turns run
- [x] 4.10 Implement apply-then-archive in the final commit and merge-to-done and verify a merged pull request ends the workflow as done

## 5. Integration and operator docs

- [x] 5.1 End-to-end test against a fake provider and runtime (issue -> propose -> request changes -> revise -> approve -> apply -> merge) and verify the change is archived and its requirements fold into the main specs
- [x] 5.2 Verify an end-to-end restart mid-workflow resumes without duplicating turns
- [x] 5.3 Write operator documentation (README with run, deploy, and config steps plus an architecture overview) and verify a new operator can start the service from the documented steps alone
- [x] 5.4 Document the `gh` CLI prerequisite and the credential fallback in the README and configuration docs, and verify the documented steps start the service with only `gh auth login`

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the new capabilities' purposes appear in the main specs.
