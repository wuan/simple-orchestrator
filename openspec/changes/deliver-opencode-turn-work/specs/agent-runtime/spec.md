# Spec Delta

## MODIFIED Requirements

### Requirement: Least-privilege repository access
A turn MUST push only to the workflow branch and MUST NOT write to the default branch, force-push, or merge. The orchestrator SHALL publish a successful turn's commits to the workflow branch, using the provider, so turn work reaches the pull request instead of being discarded with the ephemeral worktree.

#### Scenario: Push to default branch is rejected
- **WHEN** a turn attempts to write to the default branch
- **THEN** the operation is denied

#### Scenario: Merge is not performed by the turn
- **WHEN** implementation work is complete
- **THEN** the turn leaves merging to a human and does not merge

#### Scenario: Turn commits are published
- **WHEN** a turn finishes successfully
- **THEN** the orchestrator pushes only the workflow branch so the commits reach the pull request

## ADDED Requirements

### Requirement: Agent failures fail the turn
The OpenCode adapter SHALL treat an errored agent turn, or a session that ends in failure, as a failed turn, so the orchestrator signals failure instead of advancing the workflow.

#### Scenario: Agent error fails the turn
- **WHEN** the agent's turn errors or the session ends in failure
- **THEN** the adapter reports the failure and the orchestrator marks the workflow failed

### Requirement: Configured embedded host
The embedded OpenCode host SHALL run every turn's session on a configured model and, when a database is configured, SHALL use that database for provider authentication and model definitions.

#### Scenario: Configured model is used
- **WHEN** an agent model is configured
- **THEN** every turn's session runs on that model

#### Scenario: Provider authentication is reused
- **WHEN** an OpenCode database is configured
- **THEN** the embedded host uses it for provider auth and model definitions
