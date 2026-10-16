# repository-store Specification

## Purpose
Maintains a durable per-repository clone and hands each turn an isolated,
ephemeral git worktree, so turns start quickly and never share a working tree.

## Requirements

### Requirement: Persistent repository clone

The orchestrator SHALL maintain one persistent clone per configured repository
under the workspace root, at `<root>/<owner>/<name>`, creating it on first use
and reusing it afterwards.

#### Scenario: First turn clones the repository

- **WHEN** a turn begins for a repository that has no store clone yet
- **THEN** the orchestrator clones the repository's base branch into the store path

#### Scenario: Later turns reuse the store clone

- **WHEN** a turn begins and the store clone already exists
- **THEN** the orchestrator reuses it instead of cloning the repository again

### Requirement: Refresh before provisioning a workspace

The orchestrator SHALL refresh the store clone from the host before provisioning
a turn's workspace, so the workspace reflects the latest state of the workflow
branch.

#### Scenario: Workflow branch advanced

- **WHEN** a turn begins after the workflow branch gained new commits
- **THEN** the provisioned workspace includes those commits

### Requirement: Ephemeral worktree per turn

Each turn SHALL execute in a git worktree created from the store clone for the
workflow branch, and the worktree SHALL be discarded when the turn ends.

#### Scenario: Worktrees are not shared

- **WHEN** two turns run one after another
- **THEN** each turn receives its own worktree rather than a shared directory

#### Scenario: Worktree is discarded

- **WHEN** a turn completes or fails
- **THEN** its worktree is removed
