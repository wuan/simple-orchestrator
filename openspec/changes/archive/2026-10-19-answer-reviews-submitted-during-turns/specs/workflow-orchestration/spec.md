# Spec Delta

## MODIFIED Requirements

### Requirement: Idempotent turn dispatch
The orchestrator MUST process each human review or approval at most once, using host-native timestamps as the watermark, and SHALL be safe to restart without duplicating turns. It SHALL identify its own comments by its configured identity as well as by the host's bot flag, and the watermark SHALL be the newest human review timestamp that its comments record having read.

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

#### Scenario: A comment that read no review does not raise the watermark
- **WHEN** an orchestrator comment records that no human review had been read
- **THEN** it does not raise the watermark

#### Scenario: Comments posted before the marker existed still count
- **WHEN** an orchestrator comment carries no recorded review timestamp
- **THEN** its own timestamp counts toward the watermark
