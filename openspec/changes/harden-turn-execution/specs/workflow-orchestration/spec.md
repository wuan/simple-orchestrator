# Spec Delta

## ADDED Requirements

### Requirement: A failed turn reports the turn's account
When a turn ends without producing the change it had to produce and the orchestrator marks the workflow failed, the failure comment SHALL include the turn's summary and any questions it reported, in addition to the reason the orchestrator failed it, so the pull request records what the agent did and why it stopped.

#### Scenario: A turn that commits nothing reports its summary
- **WHEN** a propose or apply turn finishes without committing the change it must produce and the orchestrator marks the workflow failed
- **THEN** the failure comment includes the turn's summary

#### Scenario: Questions are carried into the failure
- **WHEN** a turn that produced no change reported questions for the human
- **THEN** the failure comment includes those questions
