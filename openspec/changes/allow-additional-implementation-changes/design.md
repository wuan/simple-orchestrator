# Design

## Context

See `proposal.md` for motivation and the spec deltas for the behavior contract.

Today `decide` (`src/orchestrator/decision.ts`) treats IMPLEMENTING as terminal
for review purposes: `terminalAction` returns idle with "implementation in
progress; awaiting merge" before looking at the newest human review. The engine
still opens the gate only from READY, sets IMPLEMENTING before its first apply
turn, and ignores every later review.

The review watermark normalizes a submitted GitHub review to an approval,
`changes_requested`, or `conversation_comment` with `origin: 'review'`. A
follow-up apply turn can reuse that same event and the same transcript that
propose turns already receive. The apply instruction is built by
`buildSkillPrompt` in `src/runtime/opencode/opencode-runtime.ts`.

## Goals / Non-Goals

**Goals:**

- Let a human continue implementation by submitting a review after the initial
  apply turn.
- Require no second approval and no new lifecycle label or phase.
- Keep the review watermark and the one-turn-per-poll behavior unchanged.
- Handle the two kinds of apply work: an active change that still needs its
  tasks and archive, and an already-archived change that only needs follow-up
  changes.
- Avoid a failure path that would re-run a propose turn for an already-archived
  change after a review-driven apply turn that had nothing to change.

**Non-Goals:**

- Reopening a workflow after its pull request is merged.
- Treating an approval in IMPLEMENTING as a request for more work; merging is the
  next action.
- A new `openspec:revising` phase, a new skill, or a new runtime.
- A separate apply-round configuration knob. Follow-up apply turns are driven by
  submitted human reviews and do not run from orchestrator activity alone.
- Automatically deciding that an archived change needs a new OpenSpec change;
  the agent follows the repository's OpenSpec workflow for the feedback it
  receives.

## Decisions

### 1. Reuse IMPLEMENTING instead of adding a phase

A follow-up apply turn keeps the workflow `openspec:implementing`. The phase
already means "approval claimed; the apply turn ran or is running and the pull
request awaits merge", and after a follow-up it still awaits merge. Adding a
phase would change every label, status snapshot, transition, and recovery rule
for behavior that is still implementation.

Alternative considered: a `revising` phase between IMPLEMENTING and merge. It
would make the extra turn visible, but it would duplicate the implementing
meaning and make merge/cancel/recovery harder to reason about.

### 2. Only feedback reviews trigger a follow-up, not approvals

In IMPLEMENTING, the action is apply when the newest human review is newer than
the watermark and its kind is `changes_requested` or a submitted review comment.
An approval in IMPLEMENTING is idle: the implementation is already approved, and
the human can merge. This mirrors the existing trigger rule that approvals gate
implementation rather than request more of it.

Alternative considered: make any review in IMPLEMENTING run apply. That would
run an agent turn when a reviewer simply approves the finished PR, and would make
the approval gate ambiguous.

### 3. A follow-up is the same apply skill, with a follow-up instruction

The runtime still runs exactly one `apply` skill. The turn context carries a
follow-up flag so the instruction can say:

- initial apply: implement the change tasks, then run `openspec archive` and
  include the archived change, code, and specs in the commit;
- follow-up apply: address the reviewer feedback, and archive only if an active
  OpenSpec change remains; if the change is already archived, commit the
  follow-up changes without archiving again.

The full review transcript and `pendingFeedback` already carry the reviewer's
words, so a new skill or a separate transcript is unnecessary.

Alternative considered: run a propose turn for post-implementation reviews. A
propose turn cannot revise an archived change and would not produce the code or
measurement work the reviewer asked for.

### 4. A review-driven follow-up may commit nothing

The existing no-progress rule fails an apply turn that commits nothing because
the workflow would otherwise mark a task-complete pull request ready with no
implementation, and no review would drive it again. That reasoning no longer
applies to a follow-up: the change was already implemented, the pull request is
already ready for review, and a review *does* drive it again. A review-driven
follow-up that commits nothing is treated like a review-driven revise turn: the
orchestrator posts the turn's summary and questions, keeps IMPLEMENTING, and
does not fail the workflow. A later review can still drive another apply turn,
and the human can merge at any time.

The initial apply turn keeps the strict rule: committing nothing would ship no
implementation, so it fails.

Alternative considered: fail every apply turn that commits nothing. That would
turn a legitimate "nothing to change" answer into FAILED, whose recovery path
re-runs the propose skill on an archived change, which is the wrong skill for
the state.

### 5. The watermark, merge, cancellation, and failure rules stay in charge

Decision precedence remains: a merged pull request finishes, a closed pull
request or removed trigger label cancels, then a terminal `done`/`failed` phase
is idle. Only after that does IMPLEMENTING inspect the newest review. The apply
turn's comment records the newest review it read, so the same review is answered
once and a review submitted while the turn runs drives the next follow-up.

A failed follow-up turn marks the workflow failed like any other turn failure.
Merge and cancellation still win over a pending review.

## Risks / Trade-offs

- A reviewer can keep submitting changes and keep driving apply turns. That is
  intentional and bounded by human action, unlike an automatic loop. The per-turn
  cost limits still bound each turn.
- Reusing IMPLEMENTING means the label does not distinguish "implementation
  still moving" from "implementation finished, waiting for merge". The turn
  comments and the ready-for-review state carry that detail.
- An already-archived change cannot be archived again. The instruction must make
  that explicit so the agent does not fail on a missing active change.
