# Proposal

## Why

Every workflow opens its pull request as a **draft**, and nothing ever releases
it from draft. GitHub refuses to merge a draft pull request, so even after the
apply turn has implemented and archived the change, a human cannot merge it and
the workflow can never reach DONE. The draft state also keeps code owners from
being requested automatically.

## What Changes

- **Release the pull request after apply.** After an apply turn finishes
  successfully - implementing the change's tasks and archiving the change - and
  its commits are published, the orchestrator marks the workflow's pull request
  ready for review, so a human can review the implementation and merge.
- **A provider operation for the transition.** `RepoProvider` gains a
  `markPullRequestReady` operation; the fake and the GitHub provider implement
  it, and the provider contract covers it.
- **GitHub goes through GraphQL.** GitHub exposes no REST endpoint for the
  transition, so the GitHub transport gains a GraphQL operation and the provider
  calls the `markPullRequestReadyForReview` mutation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repo-provider`: the provider interface gains an operation that marks a pull
  request ready for review, implemented for GitHub over GraphQL.
- `workflow-orchestration`: the pull request is released from draft after a
  successful apply turn (which applies and archives the change), and the
  workflow fails if it cannot be released.

## Impact

- **Code**: `src/provider/types.ts` (operation),
  `src/provider/fake/fake-provider.ts`, `src/provider/github/provider.ts`,
  `src/provider/github/transport.ts`, `src/provider/github/rest.ts`,
  `src/provider/github/gh-cli.ts`, `src/provider/github/map.ts` (node id), the
  in-memory GitHub testing emulator, the shared provider contract, and
  `src/orchestrator/engine.ts` (release after apply).
- **Operational**: implemented changes become reviewable and mergeable, and a
  release failure fails the workflow instead of leaving the pull request stuck
  in draft.
- **Dependencies**: none new; GraphQL goes through the existing HTTP and `gh`
  transports.
