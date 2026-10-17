# Spec Delta

## ADDED Requirements

### Requirement: Turn comments report model, tokens, and elapsed time
Every pull-request comment the orchestrator posts for a turn SHALL state the
model that ran it, the tokens it consumed broken down by kind with their total,
the elapsed wall-clock time the orchestrator measured, and the number of
attempts the turn took, so a reviewer can see the cost and latency of each
action.

#### Scenario: Propose turn comment includes metrics
- **WHEN** a propose turn finishes successfully
- **THEN** the posted turn comment reports the model, the token counts by kind
  and their total, the elapsed time, and the attempts for that turn

#### Scenario: Apply turn comment includes metrics
- **WHEN** an apply turn finishes successfully
- **THEN** the posted turn comment reports the model, the token counts by kind
  and their total, the elapsed time, and the attempts for that turn

#### Scenario: Elapsed time is measured by the orchestrator
- **WHEN** the runtime does not report a turn duration
- **THEN** the comment still reports the wall-clock time the orchestrator
  measured for the turn

#### Scenario: Retries are reported
- **WHEN** a turn fails transiently and the orchestrator retries it
- **THEN** the comment reports the number of attempts and the elapsed time
  spanning all of them

#### Scenario: Readiness prompt carries the same metrics
- **WHEN** a propose turn makes the change ready and the orchestrator prompts for
  approval
- **THEN** the readiness comment reports the same model, token counts, elapsed
  time, and attempts as the turn's own comment

#### Scenario: Failed turn reports elapsed time and known usage
- **WHEN** a turn fails
- **THEN** the failure comment reports the elapsed time, the attempts, and any
  model and token usage the runtime reported before failing

#### Scenario: Unknown metrics are stated explicitly
- **WHEN** the runtime reports no model or no token usage for a turn
- **THEN** the comment states that the value is unknown rather than omitting the
  metric

### Requirement: Lifecycle comments repeat the last turn's metrics
A pull-request comment the orchestrator posts for a transition with no turn
behind it SHALL repeat the most recent turn's metrics, labelled as the last
turn's, so every comment reports the turn's cost even when the transition itself
ran no turn.

#### Scenario: Lifecycle-only comment repeats the last turn's metrics
- **WHEN** the orchestrator posts a comment for a transition with no turn behind
  it, such as workflow completion, cancellation, or a revise-limit failure
- **THEN** the comment repeats the most recent turn's model, token counts,
  elapsed time, and attempts, labelled as the last turn's

#### Scenario: No turn to repeat
- **WHEN** the orchestrator posts a lifecycle-only comment before any turn has
  run
- **THEN** the comment states the metrics as unknown rather than omitting them
