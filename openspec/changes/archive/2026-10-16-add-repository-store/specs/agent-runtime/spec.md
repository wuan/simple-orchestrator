# Spec Delta

## MODIFIED Requirements

### Requirement: Ephemeral sandbox per turn
Each turn SHALL execute in an isolated, ephemeral environment, provisioned from the persistent repository store, that is discarded after the turn completes.

#### Scenario: No shared workspace across turns
- **WHEN** a turn finishes and a later turn begins
- **THEN** the later turn starts from a fresh environment reconstructed from the branch

#### Scenario: Provisioned from the store
- **WHEN** a turn begins
- **THEN** its workspace is a git worktree created from the repository store rather than a fresh clone of the repository

#### Scenario: Store survives the turn
- **WHEN** a turn finishes and its workspace is discarded
- **THEN** the repository store remains for later turns
