# Proposal

## Why

`README.md` explains the workflow lifecycle and the system architecture with
diagrams drawn from characters: `+`/`-` boxes with `|` and `v` arrows. Those
diagrams are brittle to edit (every label change re-flows the box), read poorly
on narrow screens, and expose no structure to assistive technology. GitHub
renders fenced `mermaid` code blocks natively, so the diagrams can be maintained
as text and still render as real graphs. Issue #30 asks that every
character-based diagram use GitHub's Mermaid support instead.

## What Changes

- Replace the character-based lifecycle diagram under "How it works" with a
  Mermaid `stateDiagram-v2` that keeps the same phases (`PROPOSING`, `READY`,
  `IMPLEMENTING`, `DONE`) and the same transitions: the objective readiness
  predicate, "review: changes requested", "review: approved", new feedback, and
  merged.
- Replace the character-based architecture diagram under "Architecture" with a
  Mermaid `flowchart` that keeps the same pipeline (`Poller` -> `WorkflowEngine`,
  the `WorkflowEngine` -> `decision` edge, and `WorkflowEngine` -> `Sandbox` ->
  `AgentRuntime` -> `RepoProvider`) and the `(plugin)` adapter labels.
- Change nothing else: the surrounding prose, headings, links, and terminology
  stay as they are, and no code, configuration, or runtime behavior changes.
- Leave the "Project layout" block as a fenced text listing. It is a directory
  tree, not a graph of relationships, and Mermaid has no faithful representation
  for it; this is the only character block left in the README afterwards.

## Capabilities

### New Capabilities

None. This change only re-renders existing documentation; it does not alter what
the system must do.

### Modified Capabilities

None. No capability's requirements change, so the change carries no spec deltas
and sets `skip_specs: true` in `.openspec.yaml`.

## Impact

- **Documentation**: `README.md` (the two diagrams). No other file changes.
- **Code**: none.
- **Dependencies / configuration / behavior**: none.
