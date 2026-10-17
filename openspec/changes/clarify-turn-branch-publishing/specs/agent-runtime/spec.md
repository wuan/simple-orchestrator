# Spec Delta

## MODIFIED Requirements

### Requirement: Least-privilege repository access
A turn MUST commit only to the workflow branch and MUST NOT push, write to the default branch, force-push, or merge. The orchestrator SHALL publish a successful turn's commits to the workflow branch, using the provider, so turn work reaches the pull request instead of being discarded with the ephemeral worktree.

#### Scenario: Push to default branch is rejected
- **WHEN** a turn attempts to write to the default branch
- **THEN** the operation is denied

#### Scenario: The turn does not push
- **WHEN** a turn finishes with commits on the workflow branch
- **THEN** the turn has not pushed the branch and the orchestrator publishes it

#### Scenario: Merge is not performed by the turn
- **WHEN** implementation work is complete
- **THEN** the turn leaves merging to a human and does not merge

#### Scenario: Turn commits are published
- **WHEN** a turn finishes successfully
- **THEN** the orchestrator pushes only the workflow branch so the commits reach the pull request

## ADDED Requirements

### Requirement: Turn instructions state who publishes the branch
The instruction the orchestrator hands to a turn SHALL direct the agent to commit its work to the workflow branch and SHALL state that the orchestrator publishes that branch after the turn. It SHALL direct the agent not to push the branch, not to merge the pull request, and not to report or speculate about the branch's push status.

#### Scenario: Instruction names the publisher
- **WHEN** the orchestrator dispatches a propose or apply turn
- **THEN** the turn instruction says the orchestrator publishes the workflow branch after the turn and tells the agent not to push

#### Scenario: Summary does not claim an unpushed branch
- **WHEN** a turn finishes and the orchestrator posts the turn's summary on the pull request
- **THEN** the summary does not state that the branch was left local or offer to push it
