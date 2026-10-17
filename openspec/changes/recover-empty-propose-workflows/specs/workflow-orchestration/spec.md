# Spec Delta

## MODIFIED Requirements

### Requirement: Recover interrupted workflows
When an issue carries the trigger label and already has an open pull request that
is not in an in-flight phase, or is in the PROPOSING phase but its workflow
branch carries no change relative to the base, the orchestrator SHALL re-run the
propose turn for that pull request rather than treating the issue as permanently
blocked, and SHALL attempt recovery at most once per pull request per process. A
PROPOSING pull request whose branch already carries a change SHALL be left to the
normal review-driven discovery.

#### Scenario: Failed workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request in the FAILED phase
- **THEN** the orchestrator runs the propose turn for that pull request once

#### Scenario: Interrupted workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request with no lifecycle phase
- **THEN** the orchestrator runs the propose turn for that pull request once

#### Scenario: Stalled proposing workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request in the PROPOSING
  phase whose workflow branch carries no change relative to the base
- **THEN** the orchestrator runs the propose turn for that pull request once, so
  it either produces the change or is marked failed and reported

#### Scenario: Proposing workflow with a proposal is left alone
- **WHEN** an open pull request in the PROPOSING phase carries a change relative
  to the base
- **THEN** the orchestrator leaves it to the normal review-driven discovery and
  does not recover it

#### Scenario: Recovery is bounded per process
- **WHEN** the orchestrator has already attempted recovery for a pull request in the current process
- **THEN** it takes no further action for that pull request

#### Scenario: In-flight workflows are left alone
- **WHEN** the open pull request already carries an in-flight phase other than a
  PROPOSING phase with no change relative to the base
- **THEN** the orchestrator leaves it to the normal review-driven discovery and does not recover it
