# agent-runtime Specification

## Purpose
Executes exactly one OpenSpec skill per turn inside an isolated sandbox, behind a pluggable runtime interface, with bounded cost and least-privilege repository access.

## Requirements

### Requirement: Pluggable runtime interface
The orchestrator SHALL execute agent work only through a runtime interface that accepts a skill identifier and turn context and returns a structured result, so runtimes can be added without changes to core orchestration.

#### Scenario: Runtime is interchangeable
- **WHEN** a different runtime adapter is configured
- **THEN** the orchestrator runs turns through it without changing orchestration logic

### Requirement: One skill per turn
Each turn SHALL invoke exactly one OpenSpec skill (propose or apply) and SHALL NOT carry state between turns beyond the repository and the review transcript.

#### Scenario: Propose turn
- **WHEN** the orchestrator runs a propose turn
- **THEN** the runtime invokes only the propose workflow

#### Scenario: Apply turn
- **WHEN** the orchestrator runs an apply turn
- **THEN** the runtime invokes only the apply workflow

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

### Requirement: Bounded turn cost
The orchestrator SHALL enforce per-turn limits on agent steps, tokens, and wall-clock time, and SHALL fail the turn when a limit is exceeded.

#### Scenario: Time limit exceeded
- **WHEN** a turn exceeds the configured wall-clock limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Step limit exceeded
- **WHEN** a turn exceeds the configured agent-step limit
- **THEN** the turn is stopped and reported as a failure

### Requirement: Structured turn result
A turn SHALL report a structured result including the commit or commits produced, a human-readable summary, and any explicit questions for the human.

#### Scenario: Agent needs input
- **WHEN** the agent cannot proceed without human input
- **THEN** the result marks the turn as needing input and the orchestrator posts the questions on the pull request

### Requirement: OpenCode adapter
The system SHALL include a runtime adapter that runs the OpenSpec propose and apply skills through OpenCode, as the first supported runtime. The adapter SHALL host OpenCode in-process through the embedded OpenCode SDK, so it does not require an operator-managed OpenCode server.

#### Scenario: Skill runs via OpenCode
- **WHEN** a propose or apply turn runs with the OpenCode adapter configured
- **THEN** the skill is executed through the embedded OpenCode host and its result is returned to the orchestrator

#### Scenario: No external server is required
- **WHEN** the OpenCode adapter runs a turn
- **THEN** it creates and owns the OpenCode host itself, without connecting to a separately managed server

### Requirement: Runtime host lifecycle
The OpenCode adapter SHALL create at most one embedded host per service process, SHALL reuse it across turns, and SHALL release the host when the service stops so its resources are reclaimed.

#### Scenario: Host reused across turns
- **WHEN** the adapter runs a second turn
- **THEN** it reuses the host created for the first turn rather than creating another

#### Scenario: Host released on shutdown
- **WHEN** the service stops
- **THEN** the adapter closes the host it created and no host resources remain

#### Scenario: Host is not created until a turn runs
- **WHEN** the service starts and stops without running a turn
- **THEN** no embedded host is created

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

### Requirement: Turn usage reporting
A turn's structured result SHALL report the model that ran the turn and the
tokens the turn consumed broken down by kind - input, output, reasoning, and
cache read and write - together with their total, so orchestration can show the
cost of each turn. The OpenCode adapter SHALL read the model and the token
counts from the turn's own session messages.

#### Scenario: OpenCode turn reports its usage
- **WHEN** a propose or apply turn completes through the OpenCode adapter
- **THEN** the turn result reports the model that ran it, read from the turn's
  assistant messages

#### Scenario: Tokens are reported by kind and in total
- **WHEN** the adapter reports the tokens a turn consumed
- **THEN** it reports the input, output, reasoning, and cache read and write
  counts and their total, read from the turn's assistant messages

#### Scenario: Usage is reported for a turn that then fails
- **WHEN** the adapter has read a turn's usage but the turn fails
- **THEN** the usage is reported before the failure, so the model and the tokens
  the turn consumed are not lost

### Requirement: Turn instructions state who publishes the branch
The instruction the orchestrator hands to a turn SHALL direct the agent to commit its work to the workflow branch and SHALL state that the orchestrator publishes that branch after the turn. It SHALL direct the agent not to push the branch, not to merge the pull request, and not to report or speculate about the branch's push status.

#### Scenario: Instruction names the publisher
- **WHEN** the orchestrator dispatches a propose or apply turn
- **THEN** the turn instruction says the orchestrator publishes the workflow branch after the turn and tells the agent not to push

#### Scenario: Summary does not claim an unpushed branch
- **WHEN** a turn finishes and the orchestrator posts the turn's summary on the pull request
- **THEN** the summary does not state that the branch was left local or offer to push it

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
