# Spec Delta

## ADDED Requirements

### Requirement: Containerized turn execution
The orchestrator SHALL run a turn's agent work inside a container of the repository's configured environment image when one is configured, executing the OpenCode loop, the agent's shell and file tools, `git`, and `openspec` there, and SHALL return the same structured result as the in-process adapter.

#### Scenario: Configured image runs the turn
- **WHEN** a repository configures an environment image and a turn runs
- **THEN** the agent's commands and file operations execute inside a container of that image

#### Scenario: Structured result is preserved
- **WHEN** a containerized turn completes
- **THEN** the orchestrator receives the turn summary and usage through the same runtime result shape as an in-process turn

#### Scenario: In-process default retained
- **WHEN** a repository configures no environment
- **THEN** the turn runs in the in-process embedded host as before

### Requirement: Environment mounts preserve the git worktree
The orchestrator SHALL mount the repository store and the turn's worktree into the container at their identical absolute host paths, so the worktree's `.git` pointer resolves and `git` inside the container operates on the turn's branch.

#### Scenario: In-container git resolves the worktree
- **WHEN** a turn runs in a container
- **THEN** `git` inside the container reads the worktree's `.git` pointer and sees the turn's branch

#### Scenario: Commits land in the mounted store
- **WHEN** a containerized turn commits
- **THEN** the commit objects are written into the mounted repository store

### Requirement: Container turn identity and writable home
The orchestrator SHALL run the container as the orchestrator's user and group with a writable home directory, and SHALL provide a git author identity, so commits written to the mounted store remain usable by the host's publish step.

#### Scenario: Host publishes container commits
- **WHEN** a containerized turn commits to the workflow branch
- **THEN** the orchestrator's later push reads those commits

#### Scenario: Commit identity is available
- **WHEN** the agent commits in the container
- **THEN** a git author identity is configured so the commit succeeds without relying on host git configuration

### Requirement: Portable turn runner
The orchestrator SHALL supply the compiled turn runner to the container as a read-only bind mount and MUST NOT require the mounted bundle to match the container's platform, resolving the OpenCode SDK inside the image for its own platform.

#### Scenario: Bundle is platform-independent
- **WHEN** the orchestrator and the container run on different platforms
- **THEN** the mounted runner is compiled JavaScript and the OpenCode SDK is resolved from the image

#### Scenario: Runner mount is read-only
- **WHEN** a turn runs
- **THEN** the runner mount is read-only so a turn cannot modify orchestrator code

### Requirement: Provider credentials cross by environment
The orchestrator SHALL pass configured environment variables into the container and MUST NOT bake provider credentials into an image or share an OpenCode database with the container.

#### Scenario: Provider auth passed through
- **WHEN** an environment names a provider variable
- **THEN** the container receives that variable's value from the orchestrator's environment

#### Scenario: No secret is stored in the image
- **WHEN** a containerized turn runs
- **THEN** provider credentials are supplied at run time rather than baked into the image

### Requirement: Per-repository network and cache mounts
The orchestrator SHALL apply the environment's configured network mode and SHALL support named-volume mounts for tool caches, defaulting the network to allow provider egress.

#### Scenario: Network policy applied
- **WHEN** an environment configures a network mode
- **THEN** the container runs with that mode

#### Scenario: Provider egress by default
- **WHEN** an environment omits the network mode
- **THEN** the container can reach the configured model provider

#### Scenario: Cache volume persists across turns
- **WHEN** an environment mounts a named cache volume
- **THEN** successive turns of that repository reuse its contents

### Requirement: Container provisioning failures fail the turn
The orchestrator SHALL fail a turn with a clear error when the image cannot be pulled or started, the container exits unsuccessfully, or the container returns a missing or malformed result.

#### Scenario: Unavailable image fails the turn
- **WHEN** a configured image cannot be pulled or started
- **THEN** the turn fails and the workflow is marked failed

#### Scenario: Failed container fails the turn
- **WHEN** the container exits unsuccessfully
- **THEN** the turn fails with the container's diagnostic

#### Scenario: Malformed result fails the turn
- **WHEN** the container does not return a valid result
- **THEN** the turn fails instead of advancing the workflow

### Requirement: Container turns are disposed with the turn
The orchestrator SHALL run one container per turn and SHALL remove it when the turn ends, whether the turn succeeded or failed.

#### Scenario: Container removed after the turn
- **WHEN** a containerized turn ends
- **THEN** its container is removed
