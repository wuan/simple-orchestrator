# Spec Delta

## MODIFIED Requirements

### Requirement: Idempotent turn dispatch
The orchestrator MUST process each human review or approval at most once, using host-native timestamps as the watermark, and SHALL be safe to restart without duplicating turns. The orchestrator SHALL identify the comments it authored by its configured identity as well as by the host's bot flag. Each comment it posts on a workflow pull request SHALL record the host timestamp of the newest human review it had read when it acted, and the watermark SHALL be the newest such recorded timestamp. A comment that records that no human review had been read SHALL NOT raise the watermark, and a comment that carries no record at all SHALL count with its own timestamp.

#### Scenario: Restart does not duplicate work
- **WHEN** the orchestrator restarts after acting on an event
- **THEN** it does not run the same turn again

#### Scenario: Poll observes no change
- **WHEN** a poll cycle finds no new human activity since the last turn
- **THEN** the orchestrator takes no action for that workflow

#### Scenario: An answered review does not drive another turn
- **WHEN** the newest human review is not newer than the watermark
- **THEN** the orchestrator takes no turn for that workflow

#### Scenario: A configured identity the host does not flag is still the orchestrator
- **WHEN** the configured identity is a normal account the host does not flag as a bot and the orchestrator has posted a comment for the newest review
- **THEN** that comment is the watermark and the review does not drive another turn

#### Scenario: A review submitted during a turn drives the next turn
- **WHEN** a human submits a review after the orchestrator read the reviews for a turn and before that turn's comment is posted
- **THEN** the review is newer than the watermark and the next poll runs a turn for it

#### Scenario: Comments posted before the marker existed still count
- **WHEN** an orchestrator comment carries no recorded review timestamp
- **THEN** its own timestamp counts toward the watermark
