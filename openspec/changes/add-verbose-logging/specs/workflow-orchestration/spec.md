# Spec Delta

## ADDED Requirements

### Requirement: Verbose poll diagnostics
When verbose logging is enabled, the orchestrator SHALL report each poll cycle, identifying the repository and what the cycle discovered and did, so an operator can follow progress without inspecting host state.

#### Scenario: Poll cycle reports discovery and actions
- **WHEN** a verbose poll cycle runs for a repository
- **THEN** the output names the repository and reports the issues discovered, the workflows started, and the action taken for each in-flight workflow

#### Scenario: Idle workflow reports its reason
- **WHEN** a verbose poll cycle finds an in-flight workflow that needs no turn
- **THEN** the output reports the workflow and the reason it is idle

#### Scenario: Nothing to do is still visible
- **WHEN** a verbose poll cycle finds no labeled issue and no in-flight workflow
- **THEN** the output still reports that the repository was polled

### Requirement: Verbose turn diagnostics
When verbose logging is enabled, the orchestrator SHALL report the lifecycle of each turn, including the skill, its target, and its outcome, so an operator can see why a turn ran and what it produced.

#### Scenario: Turn start and outcome are reported
- **WHEN** a verbose propose or apply turn runs
- **THEN** the output names the skill, the pull request and branch, and the outcome including any commits produced

#### Scenario: Readiness result is reported
- **WHEN** a verbose propose turn evaluates the readiness predicate
- **THEN** the output reports whether the change is ready

#### Scenario: Turn failure is reported
- **WHEN** a turn fails and is retried or marked failed
- **THEN** the output reports the failure reason
