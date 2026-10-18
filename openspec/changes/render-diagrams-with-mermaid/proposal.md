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
- Record the diagram contract as a new `project-documentation` capability, so
  the requirement that the overview diagrams render as Mermaid is specified
  rather than left implicit.

## Capabilities

### New Capabilities

- `project-documentation`: the README presents its graph-like overview diagrams
  (the workflow lifecycle and the system architecture) as Mermaid, keeps the
  project-layout listing as text, and keeps the prose readable on its own.

### Modified Capabilities

None. The change specifies a documentation concern as a new capability rather
than changing the behavior of an existing one, so no existing spec changes.

## Impact

- **Documentation**: `README.md` (the two diagrams).
- **Code**: none.
- **Dependencies / configuration / behavior**: none.
