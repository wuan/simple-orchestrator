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
The orchestrator SHALL enforce per-turn limits on agent steps, tokens, and wall-clock time by bounding each turn's runtime, and SHALL fail the turn when a limit is exceeded. The token budget SHALL count the tokens of new work - input, output, reasoning, and cache write - and SHALL NOT count cache reads, so the budget bounds what a turn does rather than the context it re-reads.

#### Scenario: Time limit exceeded
- **WHEN** a turn exceeds the configured wall-clock limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Step limit exceeded
- **WHEN** a turn exceeds the configured agent-step limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Token limit exceeded
- **WHEN** a turn's input, output, reasoning, and cache-write tokens exceed the configured token limit
- **THEN** the turn is stopped and reported as a failure

#### Scenario: Cache reads do not consume the token budget
- **WHEN** a turn re-reads a large, unchanged context and reports most of its tokens as cache reads
- **THEN** the cache reads do not count against the token limit, so the turn is not failed for re-reading its own context

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
The embedded OpenCode host SHALL run every turn's session on a configured model and, when a database is configured, SHALL use that database for provider authentication and model definitions. The host SHALL apply a configured provider API endpoint and a configured provider API-key environment variable to the provider the model names, and SHALL fall back to the provider's built-in endpoint and credential variable when neither is configured.

#### Scenario: Configured model is used
- **WHEN** an agent model is configured
- **THEN** every turn's session runs on that model

#### Scenario: Provider authentication is reused
- **WHEN** an OpenCode database is configured
- **THEN** the embedded host uses it for provider auth and model definitions

#### Scenario: Configured endpoint is applied
- **WHEN** a provider API endpoint is configured
- **THEN** the embedded host sends the model's requests to that endpoint instead of the provider's built-in one

#### Scenario: Configured credential variable is applied
- **WHEN** a provider API-key environment variable is configured
- **THEN** the embedded host reads the provider API key from that variable instead of the provider's built-in one

#### Scenario: Provider defaults apply when unconfigured
- **WHEN** neither an endpoint nor an API-key variable is configured
- **THEN** the embedded host uses the provider's built-in endpoint and credential variable

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
The orchestrator SHALL run a turn's agent work inside a container of the repository's configured environment image when one is configured, executing the OpenCode loop, the agent's shell and file tools, `git`, and `openspec` there, and SHALL return the same structured result as the in-process adapter. The in-container host SHALL apply the configured provider API endpoint and provider API-key variable.

#### Scenario: Configured image runs the turn
- **WHEN** a repository configures an environment image and a turn runs
- **THEN** the agent's commands and file operations execute inside a container of that image

#### Scenario: Structured result is preserved
- **WHEN** a containerized turn completes
- **THEN** the orchestrator receives the turn summary and usage through the same runtime result shape as an in-process turn

#### Scenario: In-process default retained
- **WHEN** a repository configures no environment
- **THEN** the turn runs in the in-process embedded host as before

#### Scenario: Configured provider reaches the container turn
- **WHEN** a containerized turn runs with a configured provider endpoint and API-key variable
- **THEN** the in-container host targets the configured endpoint and reads the token from the configured variable

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
The orchestrator SHALL pass configured environment variables into the container, SHALL pass the configured provider API-key variable into the container even when the environment does not name it, and MUST NOT bake provider credentials into an image or share an OpenCode database with the container.

#### Scenario: Provider auth passed through
- **WHEN** an environment names a provider variable
- **THEN** the container receives that variable's value from the orchestrator's environment

#### Scenario: Configured provider variable crosses by default
- **WHEN** a containerized turn runs and a provider API-key variable is configured
- **THEN** the container receives that variable's value from the orchestrator's environment without the environment naming it

#### Scenario: No secret is stored in the image
- **WHEN** a containerized turn runs
- **THEN** provider credentials are supplied at run time rather than baked into the image

### Requirement: Per-repository network and cache mounts
The orchestrator SHALL apply the environment's configured network mode, defaulting the network to allow provider egress, and SHALL support named-volume mounts for tool caches. Before a turn runs, the orchestrator SHALL make each mounted cache volume writable by the turn's user, so a cache path the image does not provide as writable still persists across turns.

#### Scenario: Network policy applied
- **WHEN** an environment configures a network mode
- **THEN** the container runs with that mode

#### Scenario: Provider egress by default
- **WHEN** an environment omits the network mode
- **THEN** the container can reach the configured model provider

#### Scenario: Cache volume persists across turns
- **WHEN** an environment mounts a named cache volume
- **THEN** successive turns of that repository reuse its contents

#### Scenario: Cache volume is made writable by the turn
- **WHEN** an environment mounts a named cache volume whose path the image does not provide as writable
- **THEN** the orchestrator makes the volume writable by the turn's user before the turn runs, so the turn can populate the cache

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

### Requirement: Environment image is refreshed before each turn

The orchestrator SHALL refresh a containerized turn's environment image before
starting its container according to the environment's pull policy, so a mutable
tag such as `latest` runs the image that tag currently names rather than a stale
local copy. An image reference that encodes a digest SHALL be treated as
immutable and MUST NOT be re-checked against the registry.

#### Scenario: A mutable tag picks up a published image

- **WHEN** an environment's image uses a mutable tag and a newer image was published for it
- **THEN** the next turn starts in the newer image without a manual pull

#### Scenario: The default policy checks the registry

- **WHEN** an environment sets no pull policy
- **THEN** the orchestrator applies the documented default policy, which checks the registry for the image before starting the turn

#### Scenario: A non-refreshing policy is honoured

- **WHEN** an environment sets its pull policy to a non-refreshing value
- **THEN** the orchestrator starts the turn from the local image without checking the registry

#### Scenario: A digest-pinned image is not re-checked

- **WHEN** the image reference encodes a digest
- **THEN** the orchestrator does not contact the registry to look for an update

#### Scenario: A failed refresh fails the turn

- **WHEN** the image cannot be refreshed and the policy requires a check
- **THEN** the turn fails with a clear error instead of silently running the cached image

### Requirement: Environment image reference follows the orchestrator's SDK version

The orchestrator SHALL resolve an `environment.image` reference that names no
tag to the image's `sdk-<version>` tag using its own resolved `@opencode/sdk`
version, and SHALL use a reference that already names a tag or digest verbatim,
before starting a container turn.

#### Scenario: Untagged image selects the SDK tag

- **WHEN** a repository configures `ghcr.io/wuan/simple-orchestrator/rust` without a tag and the orchestrator resolves `@opencode/sdk` version `2.2.7`
- **THEN** the turn's container runs the image `ghcr.io/wuan/simple-orchestrator/rust:sdk-2.2.7`

#### Scenario: Tagged image is used verbatim

- **WHEN** a repository configures an image with an explicit tag, such as `ghcr.io/acme/agent-java:latest`
- **THEN** the orchestrator runs exactly that tagged reference and does not replace the tag

#### Scenario: Digest reference is used verbatim

- **WHEN** a repository configures an image by digest
- **THEN** the orchestrator runs exactly that digest reference

#### Scenario: A registry port is not mistaken for a tag

- **WHEN** a repository configures `localhost:5000/agent` without a tag
- **THEN** the orchestrator resolves `localhost:5000/agent:sdk-<version>` rather than treating `5000` as a tag

### Requirement: Container turns reject an SDK mismatch

The orchestrator SHALL fail a container turn with a clear error naming both
versions when the container reports an `@opencode/sdk` version different from
the orchestrator's, so an image built for another orchestrator version cannot
silently run a turn.

#### Scenario: Mismatched image fails the turn

- **WHEN** a container reports SDK version `2.2.5` and the orchestrator resolves `2.0.32`
- **THEN** the turn fails with an error naming both versions and directing the operator to rebuild or re-pin the environment image

#### Scenario: Matching image runs the turn

- **WHEN** the container reports the same SDK version the orchestrator resolves
- **THEN** the turn proceeds and its result is accepted

### Requirement: Container turns can open configured host devices

When an environment configures devices, the orchestrator SHALL check each host
path when a turn starts, expose it at the same path inside the container, and
run the container process with the configured supplementary groups, so the turn
can open it as the orchestrator's uid/gid. An environment with no device fields
SHALL keep the container's default isolated device set.

#### Scenario: Device is openable by the turn

- **WHEN** a containerized turn runs in an environment that configures a device path
- **THEN** the turn can open that path inside the container as its configured user

#### Scenario: Supplementary groups are applied

- **WHEN** an environment configures a group that owns a device
- **THEN** the container process joins that group, so the non-root turn can open the device

#### Scenario: Replugged device is followed between turns

- **WHEN** a configured stable device name points to a device that was replugged between two turns
- **THEN** the next turn resolves the name to the device's current target

#### Scenario: Missing device fails the turn

- **WHEN** a configured device path is absent or dangling when the turn starts
- **THEN** the turn fails with an error naming the path rather than starting without it

#### Scenario: Non-device path fails the turn

- **WHEN** a configured path exists but is not a character device
- **THEN** the turn fails with an error naming the path rather than starting with an unusable mapping

#### Scenario: No device fields keep the container isolated

- **WHEN** a containerized turn runs in an environment with no device fields
- **THEN** the container sees only the runtime's default device set

### Requirement: Turn instruction advertises exposed hardware

When a containerized turn's environment exposes at least one device, the turn
instruction SHALL name each exposed device with its configured description and
any host identity the orchestrator detected, and SHALL NOT advertise a device the
environment does not expose. An environment with no devices SHALL leave the
instruction unchanged.

#### Scenario: Hardware turn names its devices

- **WHEN** a containerized turn runs in an environment that exposes device paths
- **THEN** its instruction names each exposed path

#### Scenario: Description and identity are included

- **WHEN** an exposed device has a configured description and the host reports its model or serial
- **THEN** the advertisement includes both the description and the detected identity

#### Scenario: Undetected hardware falls back to the description

- **WHEN** the host cannot report an exposed device's identity
- **THEN** the advertisement still names the path and its configured description, and the turn is not failed for the missing identity

#### Scenario: Unexposed hardware is not advertised

- **WHEN** the host has a device the environment does not list
- **THEN** the turn instruction does not mention it

#### Scenario: No devices leaves the instruction unchanged

- **WHEN** a containerized turn's environment exposes no devices
- **THEN** its instruction carries no hardware advertisement

### Requirement: Turn can read a hardware manifest

The orchestrator SHALL make a per-turn hardware manifest available to a
containerized turn at a stable path outside the git worktree, describing each
exposed device and its detected identity, so the agent can read full detail
without the instruction carrying it.

#### Scenario: Manifest is readable during the turn

- **WHEN** a containerized turn runs in an environment that exposes devices
- **THEN** the agent can read the hardware manifest at the path named in its instruction

#### Scenario: Manifest stays outside the worktree

- **WHEN** the agent reads the hardware manifest
- **THEN** the manifest is not part of the worktree, so it cannot be committed to the workflow branch

#### Scenario: Manifest describes this turn's devices

- **WHEN** two turns run in environments with different device lists
- **THEN** each turn's manifest describes only the devices that turn exposes
