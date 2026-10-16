# Spec Delta

## MODIFIED Requirements

### Requirement: Ephemeral sandbox per turn
Each turn SHALL execute in an isolated, ephemeral environment, provisioned from the persistent repository store, that is discarded after the turn completes, and the orchestrator SHALL reclaim a workflow branch left checked out by an interrupted turn so a later turn can still provision its workspace.

#### Scenario: No shared workspace across turns
- **WHEN** a turn finishes and a later turn begins
- **THEN** the later turn starts from a fresh environment reconstructed from the branch

#### Scenario: Provisioned from the store
- **WHEN** a turn begins
- **THEN** its workspace is a git worktree created from the repository store rather than a fresh clone of the repository

#### Scenario: Store survives the turn
- **WHEN** a turn finishes and its workspace is discarded
- **THEN** the repository store remains for later turns

#### Scenario: Abandoned worktree does not block a later turn
- **WHEN** a previous turn was interrupted and left its worktree on the workflow branch
- **THEN** the next turn reclaims the branch and runs in a fresh worktree
