# Proposal

## Why

The draft pull request the orchestrator opens for an issue is titled only
`OpenSpec change for issue #<n>`, which says nothing about the change itself:
a reviewer scanning pull requests cannot tell them apart without opening each
one. Its body opens with `Workflow for issue #<n>.`, a line that repeats what
the title and the closing reference already say. (Reported as issue #26, and
revised on the pull request: the title should be just the summary, and the body
should drop the description line while keeping the closing line.)

## What Changes

- **The title is the change summary.** When the orchestrator creates a
  workflow's draft pull request, its title is a short summary of the change
  drawn from the issue's title, for example `Improve PR generation`, with no
  generated `OpenSpec change for issue #<n>` prefix.
- **The body drops the description line.** The created body carries only the
  host closing reference `Closes #<n>`; it no longer repeats
  `Workflow for issue #<n>.`.
- **Merging still closes the issue.** The closing reference is kept, so a merge
  links the pull request to its issue and closes the issue automatically.
- The change covers pull requests the orchestrator creates from now on.
  Existing pull requests are not edited: the provider has no operation to
  update a pull request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the requirement that a workflow pull request's body
  carries a host closing reference alongside a short description is narrowed to
  the closing reference alone, and a new requirement makes its title the
  summary of the change instead of a generated marker.

## Impact

- **Code**: `src/orchestrator/engine.ts` - `start` hard-codes the draft pull
  request's title and body; render the title from the issue's title and reduce
  the body to the closing reference. Covered by
  `src/orchestrator/engine.test.ts`.
- **Docs**: `README.md` - describe the pull request title and body, and keep the
  claim that merging a workflow pull request closes its issue.
- **State / APIs**: no new labels, credentials, or provider operations; the
  host still auto-closes the issue on merge.
