# Spec Delta

## ADDED Requirements

### Requirement: Turn comments report model, tokens, and elapsed time
Every pull-request comment the orchestrator posts to report a turn's outcome SHALL
state the model that ran the turn, the total tokens consumed, and the elapsed
wall-clock time for that turn, so a reviewer can see the cost and latency of each
action.

#### Scenario: Propose turn comment includes metrics
- **WHEN** a propose turn finishes successfully
- **THEN** the posted turn comment reports the model, the token total, and the
  elapsed time for that turn

#### Scenario: Apply turn comment includes metrics
- **WHEN** an apply turn finishes successfully
- **THEN** the posted turn comment reports the model, the token total, and the
  elapsed time for that turn

#### Scenario: Elapsed time is measured by the orchestrator
- **WHEN** the runtime does not report a turn duration
- **THEN** the comment still reports the wall-clock time the orchestrator
  measured for the turn

#### Scenario: Readiness prompt carries the same metrics
- **WHEN** a propose turn makes the change ready and the orchestrator prompts for
  approval
- **THEN** the readiness comment reports the same model, token total, and
  elapsed time as the turn's own comment

#### Scenario: Failed turn reports elapsed time and known usage
- **WHEN** a turn fails
- **THEN** the failure comment reports the elapsed time for the turn and any
  model and token usage the runtime reported before failing

#### Scenario: Unknown metrics are stated explicitly
- **WHEN** the runtime reports no model or no token usage for a turn
- **THEN** the comment states that the value is unknown rather than omitting the
  metric

#### Scenario: Lifecycle-only comments carry no turn metrics
- **WHEN** the orchestrator posts a comment for a transition with no turn behind
  it, such as workflow completion or cancellation
- **THEN** the comment carries no model or token metrics
