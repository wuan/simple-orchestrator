# Spec Delta

## ADDED Requirements

### Requirement: Configurable workspace locations

The orchestrator SHALL let the operator configure the root for persistent
repository clones and the parent directory for per-turn worktrees, and SHALL
apply documented defaults when either is omitted.

#### Scenario: Defaults apply

- **WHEN** a configuration omits the workspace settings
- **THEN** persistent clones are kept under `~/workspace` and per-turn worktrees under the OS temp directory

#### Scenario: Overrides apply

- **WHEN** a configuration specifies a workspace root and worktree directory
- **THEN** persistent clones and per-turn worktrees are created under those paths
