# workflow-orchestration Specification

## Purpose
Drives an OpenSpec change from a repository issue through propose, human review, approval, and apply, using only polling and host-native labels as durable state.

## Requirements

### Requirement: Trigger discovery by polling
The orchestrator SHALL discover new work by polling configured repositories for issues carrying the trigger label, without requiring inbound webhooks or a public endpoint.

#### Scenario: Labeled issue is discovered
- **WHEN** an issue is opened or labeled with the configured trigger label
- **THEN** the next poll cycle starts a workflow for that issue

#### Scenario: Unlabeled issue is ignored
- **WHEN** an issue does not carry the trigger label
- **THEN** the orchestrator does not start a workflow for it

### Requirement: One change per issue behind a single pull request
Starting a workflow SHALL create a branch and exactly one draft pull request (or merge request) carrying the OpenSpec change, and each issue SHALL map to at most one active change. The branch SHALL start at the current base branch and SHALL NOT reuse a branch left behind by an earlier, inactive attempt.

#### Scenario: Workflow start creates the pull request
- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** it creates a branch containing an OpenSpec change and opens one draft pull request linked to the issue

#### Scenario: No duplicate pull request
- **WHEN** a workflow already has an active pull request for the issue
- **THEN** the orchestrator does not create a second one

#### Scenario: Branch starts at the current base
- **WHEN** the orchestrator starts a workflow for an issue with no active pull request
- **THEN** it bases the branch on the current base branch rather than on a branch left behind by an earlier attempt

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

### Requirement: Verbose poll diagnostics
When verbose logging is enabled, the orchestrator SHALL report each poll cycle, identifying the repository and what the cycle discovered and did, so an operator can follow progress without inspecting host state.

#### Scenario: Poll cycle reports discovery and actions
- **WHEN** a verbose poll cycle runs for a repository
- **THEN** the output names the repository and reports the issues discovered, the workflows started, and the action taken for each in-flight workflow

#### Scenario: Idle workflow reports its reason
- **WHEN** a verbose poll cycle finds an in-flight workflow that needs no turn
- **THEN** the output reports the workflow and the reason it is idle

#### Scenario: Nothing to do is still visible
- **WHEN** a verbose poll cycle finds no labeled issue and no in-flight workflow
- **THEN** the output still reports that the repository was polled

### Requirement: Verbose turn diagnostics
When verbose logging is enabled, the orchestrator SHALL report the lifecycle of each turn, including the skill, its target, and its outcome, so an operator can see why a turn ran and what it produced.

#### Scenario: Turn start and outcome are reported
- **WHEN** a verbose propose or apply turn runs
- **THEN** the output names the skill, the pull request and branch, and the outcome including any commits produced

#### Scenario: Readiness result is reported
- **WHEN** a verbose propose turn evaluates the readiness predicate
- **THEN** the output reports whether the change is ready

#### Scenario: Turn failure is reported
- **WHEN** a turn fails and is retried or marked failed
- **THEN** the output reports the failure reason

### Requirement: Verbose diagnostics do not corrupt the report

When verbose logging is enabled, the orchestrator SHALL write diagnostics to
standard error and MUST NOT write them to standard output, so the standard output
report stays machine-readable.

#### Scenario: One-shot report stays clean
- **WHEN** a `--once` run completes with verbose logging enabled
- **THEN** standard output contains only the per-repository summary lines and the diagnostics appear on standard error

#### Scenario: Long-running diagnostics use standard error
- **WHEN** the long-running loop emits verbose diagnostics
- **THEN** they are written to standard error rather than standard output

### Requirement: An unintegrated base fails the workflow

The orchestrator SHALL fail a turn that finishes with the current base branch
not integrated into the workflow branch, marking the workflow failed and naming
the base branch, rather than pushing a stale branch or leaving an unmergeable
pull request.

#### Scenario: Turn leaves the base unintegrated

- **WHEN** a turn finishes and the current base branch is not an ancestor of the
  workflow branch (for example, unresolved merge conflicts were left behind)
- **THEN** the orchestrator fails the turn and marks the workflow failed, naming
  the base branch that could not be integrated

#### Scenario: Turn resolves the base integration

- **WHEN** a turn integrates the base branch, resolving any conflicts, and commits
- **THEN** the orchestrator pushes the branch and the workflow continues

### Requirement: Turn commits are published before advancing
After a turn runs successfully, the orchestrator SHALL publish the workflow branch before recording the workflow's next phase, and SHALL fail the workflow when the publish fails.

#### Scenario: Successful turn is published
- **WHEN** a propose or apply turn finishes successfully
- **THEN** the workflow branch is pushed and the new phase is recorded

#### Scenario: Publish failure fails the workflow
- **WHEN** publishing the workflow branch fails
- **THEN** the orchestrator marks the workflow failed and reports the error on the pull request

### Requirement: Recover interrupted workflows
When an issue carries the trigger label and already has an open pull request that
is not in an in-flight phase, or is in the PROPOSING phase but its workflow
branch carries no change relative to the base, the orchestrator SHALL re-run the
propose turn for that pull request rather than treating the issue as permanently
blocked, and SHALL attempt recovery at most once per pull request per process.

#### Scenario: Failed workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request in the FAILED phase
- **THEN** the orchestrator runs the propose turn for that pull request once

#### Scenario: Interrupted workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request with no lifecycle phase
- **THEN** the orchestrator runs the propose turn for that pull request once

#### Scenario: Stalled proposing workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request in the PROPOSING
  phase whose workflow branch carries no change relative to the base
- **THEN** the orchestrator runs the propose turn for that pull request once, so
  it either produces the change or is marked failed and reported

#### Scenario: Recovery is bounded per process
- **WHEN** the orchestrator has already attempted recovery for a pull request in the current process
- **THEN** it takes no further action for that pull request

#### Scenario: In-flight workflows are left alone
- **WHEN** the open pull request already carries an in-flight phase other than a
  PROPOSING phase with no change relative to the base
- **THEN** the orchestrator leaves it to the normal review-driven discovery and does not recover it

### Requirement: Ready-for-review after implementation
After the apply turn finishes successfully - having implemented the change's
tasks and archived the change - and its commits are published, the orchestrator
SHALL mark the workflow's pull request ready for review so a human can review
and merge the implementation, and SHALL fail the workflow when the pull request
cannot be released from draft.

#### Scenario: Implementation is applied
- **WHEN** an apply turn finishes successfully, having implemented and archived
  the change, and its commits are published
- **THEN** the orchestrator marks the pull request ready for review

#### Scenario: Pull request is already ready
- **WHEN** the pull request is already ready for review
- **THEN** marking it ready is a no-op and the workflow advances

#### Scenario: Marking ready fails
- **WHEN** the pull request cannot be marked ready for review
- **THEN** the orchestrator marks the workflow failed and reports the error on
  the pull request

### Requirement: A propose turn that produces no change fails

When a propose turn runs without a triggering review (the initial turn or a
recovery) and completes without committing anything to the workflow branch, the
orchestrator SHALL treat the turn as failed, mark the workflow failed, and
report it, rather than leaving the change in PROPOSING where no review will
drive it.

#### Scenario: Initial propose turn commits nothing

- **WHEN** the initial propose turn for a workflow finishes and the workflow
  branch tip is unchanged
- **THEN** the orchestrator marks the workflow failed and reports the failure on
  the pull request

#### Scenario: Stalled workflow is retried once per process

- **WHEN** a propose turn fails because it produced no change
- **THEN** the workflow is marked failed and the recovery path re-runs the
  propose turn at most once per process

#### Scenario: Review-driven revise turn may be a no-op

- **WHEN** a revise turn triggered by review feedback finishes without committing
  anything because there is nothing to change
- **THEN** the orchestrator does not fail the workflow for that reason and the
  workflow keeps its phase

### Requirement: A proposing workflow with a proposal is left to review
An open pull request in the PROPOSING phase whose workflow branch already carries
a change relative to the base SHALL be left to the normal review-driven
discovery, and the orchestrator SHALL NOT recover it.

#### Scenario: Proposing workflow with a proposal is left alone
- **WHEN** an open pull request in the PROPOSING phase carries a change relative
  to the base
- **THEN** the orchestrator leaves it to the normal review-driven discovery and
  does not recover it
