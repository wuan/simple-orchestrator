# Proposal

## Why

Once an approval starts implementation, the workflow ignores every later review:
the pull request sits in `openspec:implementing` until it is merged, and a human
who asks the agent to finish or change the implementation gets no response. That
happened on `wuan/klimacontrol#49`: the apply turn committed what it could but
stopped before archiving because the measurement hardware was unavailable, then
the reviewer said the hardware was now available and requested changes. The
orchestrator ran no turn, leaving manual edits or a workflow restart as the only
ways to continue.

The approval gate exists to keep implementation from starting without a human
decision. Once it has been opened, further review should continue that
implementation, not be discarded.

## What Changes

- A new submitted review in `openspec:implementing` that requests changes or
  contains review comments runs another **apply** turn against the full review
  transcript, without requiring a second approval. The workflow stays
  `openspec:implementing`.
- An approval submitted in `openspec:implementing` still runs no turn: the
  implementation is already approved, and merging is the next human action.
- Follow-up apply turns use the existing review watermark, so an answered review
  does not run again and a review submitted during a turn drives the next turn.
- The apply instruction distinguishes an initial implementation from a follow-up:
  an initial turn implements the change and archives it; a follow-up addresses
  the reviewer's feedback and archives only if an active OpenSpec change still
  remains, so an already-archived change is not archived twice.
- An initial apply turn that commits nothing still fails, but a review-driven
  follow-up apply turn may legitimately commit nothing, like a review-driven
  revise turn: it reports its summary and questions and leaves the workflow
  `openspec:implementing`.
- The revise limit is unchanged: it still bounds review-driven propose turns,
  and apply turns, including follow-ups, do not count toward it.
- Document the revised review loop in `README.md`; no configuration field,
  lifecycle label, or new phase is introduced.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: implementation is no longer closed to review. A new
  submitted review in IMPLEMENTING runs a follow-up apply turn, apply turns
  handle an already-archived change, and a review-driven apply turn that commits
  nothing keeps the workflow in IMPLEMENTING instead of failing it.
- `agent-runtime`: the apply turn instruction distinguishes the initial
  implementation from a follow-up, and tells a follow-up not to archive an
  already-archived change.

## Impact

- `src/orchestrator/decision.ts`: an IMPLEMENTING workflow reacts to new review
  feedback with an apply action instead of always idling.
- `src/orchestrator/engine.ts` and `src/domain/types.ts`: carry whether an apply
  turn is a follow-up, allow a review-driven follow-up to commit nothing, and
  keep the implementing phase.
- `src/runtime/opencode/opencode-runtime.ts`: the apply instruction handles
  follow-up and already-archived changes.
- Decision, engine, end-to-end, and runtime-prompt tests: cover the new trigger,
  no-op follow-up, archived change, watermark, and approval-in-implementing
  cases.
- `README.md`: the happy path, trigger rules, state table, and transition table
  describe the post-implementation review loop.
