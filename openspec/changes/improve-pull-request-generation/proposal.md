# Proposal

## Why

The draft pull request the orchestrator opens for an issue is titled only
`OpenSpec change for issue #<n>`, which says nothing about the change itself:
a reviewer scanning pull requests cannot tell them apart without opening each
one. Its body also repeats the issue reference - it already opens with
`Workflow for issue #<n>.`, and that reference (like the issue number in the
title) makes the host cross-reference the pull request to its issue - so the
extra `Closes #<n>` line is noise. (Reported as issue #26.)

## What Changes

- **The title summarizes the change.** When the orchestrator creates a
  workflow's draft pull request, its title keeps naming the issue and appends a
  short summary of the change drawn from the issue's title, for example
  `OpenSpec change for issue #26: Improve PR generation`.
- **The body drops the closing line.** The created body carries only the short
  `Workflow for issue #<n>.` description. It no longer includes a
  `Closes #<n>` line; the issue number in the title and body still identifies
  the issue and cross-references the pull request to it.
- **No host auto-close.** Removing the closing keyword means a merge no longer
  closes the issue automatically through the host. The issue stays linked and
  is closed as part of the normal merge workflow.
- The change covers pull requests the orchestrator creates from now on.
  Existing pull requests are not edited: the provider has no operation to
  update a pull request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the requirement that a workflow pull request
  carries a host closing reference is replaced by one that its title
  summarizes the change while its body carries only the short description.

## Impact

- **Code**: `src/orchestrator/engine.ts` - `start` hard-codes the draft pull
  request's title and body; render the title with the issue's summary and drop
  the closing line from the body. Covered by `src/orchestrator/engine.test.ts`.
- **Docs**: `README.md` - describe the pull request title and body, and drop
  the claim that merging a workflow pull request closes its issue.
- **State / APIs**: the created pull request body loses the host closing
  keyword, so the host no longer auto-closes the issue on merge. No new labels,
  credentials, or provider operations.
