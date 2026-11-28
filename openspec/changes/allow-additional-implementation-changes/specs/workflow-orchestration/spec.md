# Spec Delta

## ADDED Requirements

### Requirement: Implementation follow-up turns

While a workflow is IMPLEMENTING, the orchestrator SHALL run an apply turn for
each new submitted human review that requests changes or contains review comments,
without requiring a second approval. An approval submitted while IMPLEMENTING
SHALL NOT run a turn. Follow-up apply turns SHALL use the review watermark and
SHALL NOT count toward the revise limit.

#### Scenario: Review after implementation runs an apply turn

- **WHEN** a pull request is IMPLEMENTING and its newest human review is newer
  than the watermark and requests changes or contains review comments
- **THEN** the orchestrator runs one apply turn that addresses that review,
  publishes its commits, and keeps the workflow IMPLEMENTING

#### Scenario: Follow-up needs no second approval

- **WHEN** a human requests changes to an implementation that already passed the
  approval gate
- **THEN** the follow-up apply turn runs without another approval

#### Scenario: Approval after implementation awaits merge

- **WHEN** the newest human review in IMPLEMENTING is an approval newer than the
  watermark
- **THEN** the orchestrator runs no turn and keeps the workflow IMPLEMENTING for
  the human to merge

#### Scenario: Answered feedback does not repeat

- **WHEN** the newest review in IMPLEMENTING is not newer than the watermark
- **THEN** the orchestrator runs no turn for it

#### Scenario: Review submitted during a follow-up turn drives the next turn

- **WHEN** a human submits review feedback after a follow-up apply turn read the
  reviews and before that turn's comment is posted
- **THEN** the feedback is newer than the watermark and the next poll runs
  another follow-up apply turn

#### Scenario: A failed follow-up fails the workflow

- **WHEN** a follow-up apply turn fails with a turn error, unresolved base merge,
  or failed push
- **THEN** the orchestrator marks the workflow failed and reports the failure

#### Scenario: Merge and cancellation still win

- **WHEN** a pull request in IMPLEMENTING is merged, is closed without merge, or
  its issue loses the trigger label while a new review is present
- **THEN** the orchestrator finishes or cancels the workflow instead of running a
  follow-up apply turn

#### Scenario: Follow-up turns do not consume revise rounds

- **WHEN** a follow-up apply turn answers a review after the revise limit is
  reached
- **THEN** the orchestrator still runs it, because the revise limit counts only
  review-driven propose turns

## MODIFIED Requirements

### Requirement: Apply implements and archives

The apply turn SHALL implement the work the change and the reviewer feedback call
for. An initial apply turn SHALL implement the change's tasks and fold
`openspec archive` into the final commit when the change can be completed. A
follow-up apply turn SHALL address the newest reviewer feedback and SHALL archive
only when an active OpenSpec change still remains, so an already-archived change
is not archived again. Merge SHALL land code, updated specs, and the archived
change together when the change was archived.

#### Scenario: Apply completes

- **WHEN** an apply turn runs for an approved change
- **THEN** it implements the tasks, archives the change, and commits both to the
  branch

#### Scenario: Follow-up apply completes an active change

- **WHEN** a follow-up apply turn addresses reviewer feedback while an active
  OpenSpec change remains
- **THEN** it implements the remaining tasks and feedback, archives the change,
  and commits the result

#### Scenario: Follow-up apply works on an archived change

- **WHEN** a follow-up apply turn addresses reviewer feedback after the change
  has already been archived
- **THEN** it commits the requested changes without archiving the change again

#### Scenario: Merge completes the workflow

- **WHEN** the pull request is merged
- **THEN** the orchestrator marks the workflow done

### Requirement: Ready-for-review after implementation

After an apply turn finishes successfully and its commits, when any, are
published, the orchestrator SHALL mark the workflow's pull request ready for
review so a human can review and merge the implementation. An initial apply turn
SHALL have implemented the change's tasks and archived the change. A follow-up
apply turn SHALL have addressed the reviewer's feedback; when it commits nothing,
it SHALL leave the pull request ready for review and the workflow IMPLEMENTING.
The orchestrator SHALL fail the workflow when the pull request cannot be released
from draft.

#### Scenario: Implementation is applied

- **WHEN** an apply turn finishes successfully, having implemented and archived
  the change, and its commits are published
- **THEN** the orchestrator marks the pull request ready for review

#### Scenario: Follow-up implementation is applied

- **WHEN** a follow-up apply turn finishes successfully and its commits are
  published
- **THEN** the orchestrator marks the pull request ready for review and keeps the
  workflow IMPLEMENTING

#### Scenario: Follow-up commits nothing

- **WHEN** a review-driven follow-up apply turn finishes without committing
  anything
- **THEN** the orchestrator leaves the pull request ready for review, posts the
  turn's summary and questions, and keeps the workflow IMPLEMENTING

#### Scenario: Pull request is already ready

- **WHEN** the pull request is already ready for review
- **THEN** marking it ready is a no-op and the workflow advances

#### Scenario: Marking ready fails

- **WHEN** the pull request cannot be marked ready for review
- **THEN** the orchestrator marks the workflow failed and reports the error on
  the pull request

### Requirement: An apply turn that produces no change fails

When an initial apply turn completes without committing anything to the workflow
branch, the orchestrator SHALL treat the turn as failed, mark the workflow
failed, and report it, rather than marking the pull request ready for review and
recording the implementing phase, where no review drives the workflow again. A
review-driven follow-up apply turn that commits nothing SHALL NOT fail for that
reason: it SHALL post the turn's summary and questions, keep the workflow
IMPLEMENTING, and leave the pull request ready for review, because a later review
can still drive another turn and the human can merge.

#### Scenario: Apply turn commits nothing

- **WHEN** an initial apply turn for an approved change finishes and the workflow
  branch tip is unchanged
- **THEN** the orchestrator does not publish the branch, marks the workflow
  failed, and reports the failure on the pull request

#### Scenario: Follow-up apply turn commits nothing

- **WHEN** a review-driven follow-up apply turn finishes and the workflow branch
  tip is unchanged
- **THEN** the orchestrator posts the turn's summary and questions, keeps the
  workflow IMPLEMENTING, and does not fail it for the lack of a commit

#### Scenario: Apply turn commits its implementation

- **WHEN** an apply turn implements the requested work and commits to the
  workflow branch
- **THEN** the orchestrator publishes the branch, marks the pull request ready
  for review, and records the implementing phase
