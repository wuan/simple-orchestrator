# Spec Delta

## MODIFIED Requirements

### Requirement: Bounded propose, review, revise turns
Each turn SHALL run as a stateless unit that re-reads the branch and the full review conversation, and the orchestrator SHALL limit the number of revise rounds per workflow, counting its own turns as those authored by its configured identity.

#### Scenario: Review feedback triggers a revise turn
- **WHEN** a human submits a review that is not an approval and it is newer than the orchestrator's last turn
- **THEN** the orchestrator runs one revise turn incorporating all feedback since the previous turn

#### Scenario: Revise limit reached
- **WHEN** the number of revise rounds reaches the configured maximum without reaching READY
- **THEN** the orchestrator stops the workflow, marks it failed, and notifies on the pull request

#### Scenario: Own turns count toward the revise limit
- **WHEN** the orchestrator's configured identity is a normal account the host does not flag as a bot
- **THEN** the turns it posts still count toward the revise-round limit

### Requirement: Idempotent turn dispatch
The orchestrator MUST process each human review or approval at most once, using host-native timestamps as the watermark, and SHALL be safe to restart without duplicating turns. The orchestrator SHALL identify the comments it authored by its configured identity as well as by the host's bot flag, and SHALL treat its most recent comment as the record that the newest feedback was answered.

#### Scenario: Restart does not duplicate work
- **WHEN** the orchestrator restarts after acting on an event
- **THEN** it does not run the same turn again

#### Scenario: Poll observes no change
- **WHEN** a poll cycle finds no new human activity since the last turn
- **THEN** the orchestrator takes no action for that workflow

#### Scenario: An answered review does not drive another turn
- **WHEN** the newest human review is not newer than the orchestrator's most recent comment
- **THEN** the orchestrator takes no turn for that workflow

#### Scenario: A configured identity the host does not flag is still the orchestrator
- **WHEN** the configured identity is a normal account the host does not flag as a bot and the orchestrator has posted a comment for the newest review
- **THEN** that comment is the watermark and the review does not drive another turn
