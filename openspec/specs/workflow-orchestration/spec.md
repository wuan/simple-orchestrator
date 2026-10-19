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
Each turn SHALL run as a stateless unit that re-reads the branch and the full review conversation, and the orchestrator SHALL limit the number of revise rounds per workflow, counting its own turns as those authored by its configured identity.

#### Scenario: Review feedback triggers a revise turn
- **WHEN** a human submits a review that is not an approval and it is newer than the orchestrator's last turn
- **THEN** the orchestrator runs one revise turn incorporating all feedback since the previous turn

#### Scenario: Revise limit reached
- **WHEN** the number of revise rounds reaches the configured maximum without reaching READY
- **THEN** the orchestrator stops the workflow, marks it failed, and notifies on the pull request

#### Scenario: Own turns count toward the revise limit
- **WHEN** the orchestrator's configured identity is a normal account the host does not flag as a bot
- **THEN** the turns it posts still count toward the revise-round limit

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
The orchestrator MUST process each human review or approval at most once, using host-native timestamps as the watermark, and SHALL be safe to restart without duplicating turns. The orchestrator SHALL identify the comments it authored by its configured identity as well as by the host's bot flag, and SHALL treat its most recent comment as the record that the newest feedback was answered.

#### Scenario: Restart does not duplicate work
- **WHEN** the orchestrator restarts after acting on an event
- **THEN** it does not run the same turn again

#### Scenario: Poll observes no change
- **WHEN** a poll cycle finds no new human activity since the last turn
- **THEN** the orchestrator takes no action for that workflow

#### Scenario: An answered review does not drive another turn
- **WHEN** the newest human review is not newer than the orchestrator's most recent comment
- **THEN** the orchestrator takes no turn for that workflow

#### Scenario: A configured identity the host does not flag is still the orchestrator
- **WHEN** the configured identity is a normal account the host does not flag as a bot and the orchestrator has posted a comment for the newest review
- **THEN** that comment is the watermark and the review does not drive another turn

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

### Requirement: Workflow pull request references its issue

When the orchestrator creates the draft pull request for a workflow, its body
SHALL carry the host-recognized closing reference to the workflow's issue (for
example `Closes #<n>`), and SHALL NOT repeat the issue as a
`Workflow for issue #<n>.` description, so the host links the pull request to
the issue and closes the issue when the pull request is merged.

#### Scenario: Created pull request references its issue

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the body of the created draft pull request contains a closing
  reference to that issue

#### Scenario: Created pull request drops the description line

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the body of the created draft pull request does not repeat a
  `Workflow for issue #<n>.` description

#### Scenario: Merging the pull request closes the issue

- **WHEN** a workflow pull request whose body carries the closing reference is
  merged into the host's default branch
- **THEN** the host closes the referenced issue

### Requirement: A proposing workflow with a proposal is left to review
An open pull request in the PROPOSING phase whose workflow branch already carries
a change relative to the base SHALL be left to the normal review-driven
discovery, and the orchestrator SHALL NOT recover it.

#### Scenario: Proposing workflow with a proposal is left alone
- **WHEN** an open pull request in the PROPOSING phase carries a change relative
  to the base
- **THEN** the orchestrator leaves it to the normal review-driven discovery and
  does not recover it

### Requirement: Turn comments report model, tokens, and elapsed time
Every pull-request comment the orchestrator posts for a turn SHALL state the
model that ran it, the tokens it consumed broken down by kind with their total,
the elapsed wall-clock time the orchestrator measured, and the number of
attempts the turn took, so a reviewer can see the cost and latency of each
action.

#### Scenario: Propose turn comment includes metrics
- **WHEN** a propose turn finishes successfully
- **THEN** the posted turn comment reports the model, the token counts by kind
  and their total, the elapsed time, and the attempts for that turn

#### Scenario: Apply turn comment includes metrics
- **WHEN** an apply turn finishes successfully
- **THEN** the posted turn comment reports the model, the token counts by kind
  and their total, the elapsed time, and the attempts for that turn

#### Scenario: Elapsed time is measured by the orchestrator
- **WHEN** the runtime does not report a turn duration
- **THEN** the comment still reports the wall-clock time the orchestrator
  measured for the turn

#### Scenario: Retries are reported
- **WHEN** a turn fails transiently and the orchestrator retries it
- **THEN** the comment reports the number of attempts and the elapsed time
  spanning all of them

#### Scenario: Readiness prompt carries the same metrics
- **WHEN** a propose turn makes the change ready and the orchestrator prompts for
  approval
- **THEN** the readiness comment reports the same model, token counts, elapsed
  time, and attempts as the turn's own comment

#### Scenario: Failed turn reports elapsed time and known usage
- **WHEN** a turn fails
- **THEN** the failure comment reports the elapsed time, the attempts, and any
  model and token usage the runtime reported before failing

#### Scenario: Unknown metrics are stated explicitly
- **WHEN** the runtime reports no model or no token usage for a turn
- **THEN** the comment states that the value is unknown rather than omitting the
  metric

### Requirement: Lifecycle comments repeat the last turn's metrics
A pull-request comment the orchestrator posts for a transition with no turn
behind it SHALL repeat the most recent turn's metrics, labelled as the last
turn's, so every comment reports the turn's cost even when the transition itself
ran no turn.

#### Scenario: Lifecycle-only comment repeats the last turn's metrics
- **WHEN** the orchestrator posts a comment for a transition with no turn behind
  it, such as workflow completion, cancellation, or a revise-limit failure
- **THEN** the comment repeats the most recent turn's model, token counts,
  elapsed time, and attempts, labelled as the last turn's

#### Scenario: No turn to repeat
- **WHEN** the orchestrator posts a lifecycle-only comment before any turn has
  run
- **THEN** the comment states the metrics as unknown rather than omitting them

### Requirement: Workflow pull request title summarizes its change

When the orchestrator creates the draft pull request for a workflow, its title
SHALL be a Conventional Commit subject of the form `<type>(<scope>): <summary>`
deduced from the issue context, and SHALL NOT be a generated marker that repeats
the issue number.

#### Scenario: Created pull request title summarizes its change

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the title of the created draft pull request is a Conventional Commit
  subject whose summary is the compacted issue title

#### Scenario: Type is deduced from the issue labels

- **WHEN** the issue carries a label naming a change type (for example `bug`)
- **THEN** the created draft pull request's title begins with the corresponding
  type (for example `fix`)

#### Scenario: Label matching is case-insensitive

- **WHEN** the issue carries the type label in a different case (for example
  `Bug`)
- **THEN** the created draft pull request's title still begins with the
  corresponding type

#### Scenario: Default type applies

- **WHEN** neither the issue title nor the issue labels name a Conventional
  Commit type
- **THEN** the created draft pull request's title begins with `feat`

#### Scenario: Already-conventional issue title is preserved

- **WHEN** the issue title already begins with a Conventional Commit prefix
- **THEN** the created draft pull request's title keeps that type, and its scope
  when present, and uses the remaining title as the summary

#### Scenario: A prefix with an unrecognized type is not a Conventional Commit prefix

- **WHEN** the issue title begins with a word before the colon that is not one of
  the project's Conventional Commit types
- **THEN** the created draft pull request's title does not keep that prefix and
  its type is deduced from the issue's labels instead

#### Scenario: Summary is compacted as much as possible to the subject limit

- **WHEN** the issue title is longer than the project's commit-subject limit
- **THEN** the created draft pull request's title normalizes the summary (trims
  it, collapses its whitespace, drops a trailing period, and drops any stale
  trailing ellipsis) and shortens it at a word boundary so it stays under the
  limit, ending the shortened summary with a single ellipsis and never rewriting
  its words

#### Scenario: Title does not repeat the issue number

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the created draft pull request's title carries no generated
  `OpenSpec change for issue #<n>` marker

#### Scenario: Merging keeps the conventional subject

- **WHEN** a workflow pull request titled with a Conventional Commit subject is
  squash-merged into the host's default branch
- **THEN** the resulting commit subject is that Conventional Commit subject

### Requirement: Workflow pull request title parts are deduced and compacted

The `type` and optional `scope` of the created title SHALL come from an issue
title already beginning with one of the project's Conventional Commit types
(`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`);
otherwise the `type` SHALL come from the issue's labels, matched
case-insensitively and defaulting to `feat`, with no scope. The `summary` SHALL be
the issue title compacted to the project's 72-character commit-subject limit,
keeping the author's words.

#### Scenario: The recognized types are the project's Conventional Commit types

- **WHEN** an issue title begins with a type that is one of the project's
  Conventional Commit types
- **THEN** the created draft pull request's title keeps that type

#### Scenario: No scope is taken from the issue labels

- **WHEN** the issue title is not already conventional and the issue's labels
  name a type
- **THEN** the created draft pull request's title carries no scope

#### Scenario: A stale ellipsis is replaced rather than repeated

- **WHEN** the issue title already ends with an ellipsis left by an earlier
  compaction and is still longer than the limit
- **THEN** the created draft pull request's title drops that ellipsis before
  measuring and ends the shortened summary with a single ellipsis, not two

### Requirement: Pull request title is reconciled with the applied outcome

After an apply turn finishes and its commits are published, and before the
workflow advances, the orchestrator SHALL derive the applied type and optional
scope from the implementation Conventional Commit subjects that turn added, and
update the pull request title, keeping its summary, when the agreed type or
scope differs. A scope is adopted only with an agreed type and a single agreed
scope; otherwise it comes only from a conventional issue title, never invented.

#### Scenario: Applied outcome changes the type

- **WHEN** the apply turn's implementation subjects agree on a Conventional
  Commit type different from the deduced one
- **THEN** the orchestrator updates the pull request title to the applied type
  before the workflow advances

#### Scenario: Applied outcome determines the scope

- **WHEN** the apply turn's implementation subjects agree on a Conventional
  Commit type and the subjects that carry a scope all carry the same scope
- **THEN** the orchestrator updates the pull request title to use that scope,
  replacing a scope deduced from the issue title when the two differ

#### Scenario: Reconciled title keeps its summary

- **WHEN** the orchestrator reconciles the pull request title with the applied
  type or scope
- **THEN** the title keeps the summary it already carried, changing only its type
  and scope

#### Scenario: Several applied scopes keep the deduced scope

- **WHEN** the apply turn's implementation subjects carry more than one
  Conventional Commit scope
- **THEN** the orchestrator keeps the deduced scope and reconciles only the type
  the subjects agree on

#### Scenario: An outcome without a scope keeps the deduced scope

- **WHEN** the issue title brought a scope into the created title and the apply
  turn's implementation subjects agree on a type but none carries a scope
- **THEN** the orchestrator reconciles the type and keeps the scope deduced from
  the issue title

#### Scenario: No scope is invented

- **WHEN** neither the issue title nor the applied commits make a scope clear
- **THEN** the pull request title carries no scope

#### Scenario: Ambiguous outcome keeps the deduced title

- **WHEN** the apply turn's commits do not agree on a type, or carry no
  Conventional Commit subject
- **THEN** the orchestrator leaves the deduced title unchanged

#### Scenario: A failed outcome read keeps the deduced title

- **WHEN** reading the apply turn's commit subjects fails
- **THEN** the orchestrator leaves the deduced title unchanged and still advances
  the workflow

#### Scenario: A prefix with an unrecognized type is not an applied subject

- **WHEN** the apply turn's commits carry a `word:`-style prefix whose word is
  not one of the project's Conventional Commit types
- **THEN** the orchestrator does not derive the applied type from it

#### Scenario: A title that does not parse is left unchanged

- **WHEN** the current pull request title does not parse as a recognized
  Conventional Commit subject
- **THEN** the orchestrator leaves the title unchanged

#### Scenario: Propose commits do not decide the outcome

- **WHEN** the apply turn adds a Conventional Commit subject and the workflow
  branch also carries the propose turn's `docs(openspec)` commits
- **THEN** the orchestrator reconciles from the apply turn's commits only, and
  the propose commits do not force the deduced title to be kept

#### Scenario: OpenSpec bookkeeping commits do not decide the outcome

- **WHEN** an apply turn commits both an implementation subject and an OpenSpec
  bookkeeping subject scoped `openspec` (for example its archive commit)
- **THEN** the orchestrator derives the applied type and scope from the
  implementation subject and does not treat the bookkeeping subject as a
  disagreement

#### Scenario: Title update failure does not fail the workflow

- **WHEN** updating the pull request title fails
- **THEN** the orchestrator reports the failure and still advances the workflow
  to implementing and ready for review

### Requirement: Reconciled pull request title stays within the subject limit

When reconciliation applies an applied type or scope, the resulting title SHALL
stay under the project's commit-subject limit of 72 characters (per `AGENTS.md`)
by shortening the kept summary at a word boundary, bounded only in length and
never in its words.

#### Scenario: Reconciled title keeps the subject limit

- **WHEN** applying the applied type or scope would make the subject reach the
  project's commit-subject limit
- **THEN** the orchestrator shortens the kept summary at a word boundary,
  replacing any ellipsis it already carried, so the reconciled title stays under
  the limit

### Requirement: A merged workflow is not started again
The orchestrator SHALL NOT start a new workflow for a trigger-labeled issue when
a pull request associated with that issue has already been merged, even if the
host has not yet closed the issue. A pull request closed without being merged
SHALL NOT resolve the issue.

#### Scenario: Merged workflow pull request is not restarted
- **WHEN** a trigger-labeled issue's workflow pull request has been merged and
  the host has not yet closed the issue
- **THEN** the orchestrator starts no workflow and creates no second pull
  request for that issue

#### Scenario: Issue without a pull request still starts
- **WHEN** a trigger-labeled issue has no pull request associated with it
- **THEN** the orchestrator starts a workflow as before

#### Scenario: Closed-without-merge pull request still starts
- **WHEN** the only pull request associated with a trigger-labeled issue was
  closed without being merged
- **THEN** the orchestrator may start a new workflow for the issue

#### Scenario: The skip is reported
- **WHEN** verbose logging is enabled and a trigger-labeled issue is skipped
  because an associated pull request was merged
- **THEN** the poll output reports the issue and the merged pull request that
  resolved it
