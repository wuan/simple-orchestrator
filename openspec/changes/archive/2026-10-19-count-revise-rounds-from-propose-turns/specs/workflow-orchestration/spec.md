# Spec Delta

## MODIFIED Requirements

### Requirement: Bounded propose, review, revise turns
Each turn SHALL run as a stateless unit that re-reads the branch and the full review conversation, and the orchestrator SHALL limit the number of revise rounds per workflow, counting its own turns as those authored by its configured identity. A revise round SHALL be a propose turn after the initial one; the orchestrator's other comments (readiness prompts, failure, cancellation, completion, and other notices) and apply turns SHALL NOT count toward the limit.

#### Scenario: Review feedback triggers a revise turn
- **WHEN** a human submits a review that is not an approval and it is newer than the orchestrator's last turn
- **THEN** the orchestrator runs one revise turn incorporating all feedback since the previous turn

#### Scenario: Revise limit reached
- **WHEN** the number of revise rounds reaches the configured maximum without reaching READY
- **THEN** the orchestrator stops the workflow, marks it failed, and notifies on the pull request

#### Scenario: Own turns count toward the revise limit
- **WHEN** the orchestrator's configured identity is a normal account the host does not flag as a bot
- **THEN** the turns it posts still count toward the revise-round limit

#### Scenario: Comments that are not propose turns do not count
- **WHEN** the orchestrator has posted comments other than propose turn comments, such as the prompt that a change is ready for development
- **THEN** those comments do not count toward the revise-round limit, so a change that reaches READY on every turn still gets the configured number of revise rounds
