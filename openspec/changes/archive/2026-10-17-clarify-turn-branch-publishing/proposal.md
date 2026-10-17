# Proposal

## Why

After an apply turn, the summary posted on the pull request has claimed the
branch was left local, for example: "I left the branch local (not pushed). If
you want it pushed to origin/openspec/issue-22, let me know." That is
misleading: the orchestrator publishes the workflow branch itself after every
successful turn, and the pull request already shows the commit. The turn
instruction tells the agent to "commit all work to the current branch only" and
"never push to another branch", which reads as "do not push", so the agent
hedges about push status in the only place it reports back.

## What Changes

- **State who publishes in the turn instruction.** The instruction handed to a
  turn tells the agent to commit its work to the workflow branch and that the
  orchestrator publishes that branch after the turn. It also tells the agent not
  to push, not to merge the pull request, and not to report or speculate about
  the branch's push status.
- **Align the agent-runtime spec with reality.** The least-privilege requirement
  currently says a turn pushes to the workflow branch; in practice a turn
  commits and the orchestrator publishes, and the turn has no credentials to
  push. The requirement is corrected so the spec and the instruction agree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: the turn instruction states that the orchestrator publishes
  the workflow branch and that the turn must not push or report push status, and
  the least-privilege requirement describes a turn that commits rather than
  pushes.

## Impact

- **Code**: `src/runtime/opencode/opencode-runtime.ts` (`buildSkillPrompt`) and
  its unit test `src/runtime/opencode/opencode-runtime.test.ts`.
- **Behavior**: turn summaries no longer claim the branch is unpushed and no
  longer offer to push it; who pushes is unchanged (the orchestrator does).
- **Dependencies / configuration**: none.
