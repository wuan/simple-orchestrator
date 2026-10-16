# Spec Delta

## Purpose

Drives an OpenSpec change from a repository issue through propose, human review, approval, and apply, using only polling and host-native labels as durable state.

## ADDED Requirements

### Requirement: Trigger discovery by polling
The orchestrator SHALL discover new work by polling configured repositories for issues carrying the trigger label, without requiring inbound webhooks or a public endpoint.

#### Scenario: Labeled issue is discovered
- **WHEN** an issue is opened or labeled with the configured trigger label
- **THEN** the next poll cycle starts a workflow for that issue

#### Scenario: Unlabeled issue is ignored
- **WHEN** an issue does not carry the trigger label
- **THEN** the orchestrator does not start a workflow for it

### Requirement: One change per issue behind a single pull request
Starting a workflow SHALL create a branch and exactly one draft pull request (or merge request) carrying the OpenSpec change, and each issue SHALL map to at most one active change.

#### Scenario: Workflow start creates the pull request
- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** it creates a branch containing an OpenSpec change and opens one draft pull request linked to the issue

#### Scenario: No duplicate pull request
- **WHEN** a workflow already has an active pull request for the issue
- **THEN** the orchestrator does not create a second one

### Requirement: Bounded propose, review, revise turns
Each turn SHALL run as a stateless unit that re-reads the branch and the full review conversation, and the orchestrator SHALL limit the number of revise rounds per workflow.

#### Scenario: Review feedback triggers a revise turn
- **WHEN** a human submits a review that is not an approval and it is newer than the orchestrator's last turn
- **THEN** the orchestrator runs one revise turn incorporating all feedback since the previous turn

#### Scenario: Revise limit reached
- **WHEN** the number of revise rounds reaches the configured maximum without reaching READY
- **THEN** the orchestrator stops the workflow, marks it failed, and notifies on the pull request

### Requirement: Objective readiness predicate
The orchestrator SHALL mark a change READY only when the OpenSpec change is complete and passes strict validation, computed from the OpenSpec CLI rather than from agent output.

#### Scenario: Change becomes ready
- **WHEN** all artifacts of the change are done and `openspec validate --strict` passes
- **THEN** the orchestrator sets the change to READY and prompts for approval

#### Scenario: Agent claims readiness prematurely
- **WHEN** an agent reports the change is ready but the readiness predicate does not pass
- **THEN** the orchestrator keeps the change in PROPOSING

### Requirement: Human approval gate
The orchestrator SHALL start implementation only for a READY change that has received a host-native approval from a human.

#### Scenario: Approved ready change proceeds
- **WHEN** a READY change receives an approving review from a human
- **THEN** the orchestrator enqueues the apply turn

#### Scenario: Approval before ready
- **WHEN** an approval is present but the change is not READY
- **THEN** the orchestrator does not start implementation until the change is READY with a valid approval

### Requirement: Approval is consumed as a claim
Before starting an apply turn, the orchestrator MUST record that the approval was consumed in a way that survives later commits dismissing the review, so implementation starts at most once per approval.

#### Scenario: Approval consumed before push
- **WHEN** an approving review is acted upon
- **THEN** the orchestrator records the claim before any commit is pushed

#### Scenario: Approval later dismissed
- **WHEN** a commit pushed by the apply turn causes the host to dismiss the approval
- **THEN** the orchestrator does not run apply again for that approval

### Requirement: Apply implements and archives
The apply turn SHALL implement the change's tasks and fold `openspec archive` into the final commit so that merge lands code, updated specs, and the archived change together.

#### Scenario: Apply completes
- **WHEN** an apply turn runs for an approved change
- **THEN** it implements the tasks, archives the change, and commits both to the branch

#### Scenario: Merge completes the workflow
- **WHEN** the pull request is merged
- **THEN** the orchestrator marks the workflow done

### Requirement: Lifecycle labels convey state
The orchestrator SHALL represent workflow state with host-native labels (proposing, ready, implementing, done, failed) so state is visible and durable without a database.

#### Scenario: State is visible on the pull request
- **WHEN** a workflow is in a given phase
- **THEN** the corresponding lifecycle label is present on the pull request

### Requirement: Idempotent turn dispatch
The orchestrator MUST process each human review or approval at most once, using labels and timestamps as the watermark, and SHALL be safe to restart without duplicating turns.

#### Scenario: Restart does not duplicate work
- **WHEN** the orchestrator restarts after acting on an event
- **THEN** it does not run the same turn again

#### Scenario: Poll observes no change
- **WHEN** a poll cycle finds no new human activity since the last turn
- **THEN** the orchestrator takes no action for that workflow

### Requirement: Review drives turns, comments do not
The orchestrator SHALL treat a submitted review (comment or change request) as a turn trigger and SHALL treat plain conversation comments as non-triggering.

#### Scenario: Submitted review triggers a turn
- **WHEN** a human submits a review containing feedback
- **THEN** the orchestrator runs a turn

#### Scenario: Plain comment is ignored
- **WHEN** a human posts a comment that is not part of a submitted review
- **THEN** the orchestrator does not run a turn

### Requirement: Cancellation
The orchestrator SHALL stop a workflow when the trigger label is removed or the pull request is closed without merge.

#### Scenario: Trigger label removed
- **WHEN** the trigger label is removed from the issue
- **THEN** the orchestrator stops the workflow and takes no further turns

### Requirement: Transient failure handling
The orchestrator SHALL retry a transient turn failure at most once and SHALL never leave a partially applied change without signalling failure.

#### Scenario: Turn fails transiently
- **WHEN** a turn fails for a transient reason
- **THEN** the orchestrator retries it once before marking the workflow failed

#### Scenario: Turn fails permanently
- **WHEN** a turn fails and the retry also fails
- **THEN** the orchestrator marks the workflow failed and posts the failure on the pull request
