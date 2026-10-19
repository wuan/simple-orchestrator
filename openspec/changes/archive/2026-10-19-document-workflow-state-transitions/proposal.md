# Proposal

## Why

The README draws the workflow lifecycle as a state diagram, but it does not say
which transitions are actually possible, how the pull request is labelled to
show the current phase, or which exact action each event runs. A reader cannot
tell, for example, that the trigger label lives on the issue while the phase
label lives on the pull request, what happens to review feedback after
implementation starts, or which events end a workflow. Issue #45 asks for a
table listing every transition per state with the action it triggers.

## What Changes

- Add a transition table under "How it works" that lists, for each phase
  (PROPOSING, READY, IMPLEMENTING, DONE, FAILED), the triggers that apply in that
  phase, the resulting phase, and the action the orchestrator runs: start,
  propose turn, apply turn, finish, cancel, fail, recover, or idle.
- Add a phase-label reference next to the diagram explaining that the `openspec`
  trigger label is carried by the issue, that the current phase is marked by its
  lifecycle label on the pull request (`openspec:proposing`, `openspec:ready`,
  `openspec:implementing`, `openspec:done`, `openspec:failed`) with setting a
  phase replacing any other phase label, and that these names are configurable.
- Correct the lifecycle diagram so it shows only transitions the orchestrator
  can perform. In particular, IMPLEMENTING does not go back to PROPOSING on new
  feedback today; the workflow is idle awaiting merge, and the table is
  authoritative where the diagram simplifies.
- Cover the entry, revise, approval/apply, merge, failure, cancellation, and
  recovery transitions, including how a failed or interrupted workflow is
  recovered.
- Change no code, runtime behavior, configuration, or dependencies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-documentation`: adds a requirement that the README documents the
  workflow state machine next to the lifecycle diagram - every state, its
  triggers, the lifecycle label that shows the current state, and the action
  each trigger runs - and that the diagram does not contradict the table.

## Impact

- **Documentation**: `README.md` under "How it works" (the lifecycle diagram and
  new reference tables/prose).
- **Code, APIs, dependencies, configuration, behavior**: none.
