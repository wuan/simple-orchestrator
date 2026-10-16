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
Each turn SHALL execute in an isolated, ephemeral environment that is discarded after the turn completes.

#### Scenario: No shared workspace across turns
- **WHEN** a turn finishes and a later turn begins
- **THEN** the later turn starts from a fresh environment reconstructed from the branch

### Requirement: Least-privilege repository access
A turn MUST push only to the workflow branch and MUST NOT write to the default branch, force-push, or merge.

#### Scenario: Push to default branch is rejected
- **WHEN** a turn attempts to write to the default branch
- **THEN** the operation is denied

#### Scenario: Merge is not performed by the turn
- **WHEN** implementation work is complete
- **THEN** the turn leaves merging to a human and does not merge

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
The system SHALL include a runtime adapter that runs the OpenSpec propose and apply skills through OpenCode, as the first supported runtime.

#### Scenario: Skill runs via OpenCode
- **WHEN** a propose or apply turn runs with the OpenCode adapter configured
- **THEN** the skill is executed through OpenCode and its result is returned to the orchestrator
