# Spec Delta

## ADDED Requirements

### Requirement: Apply instruction distinguishes implementation follow-up turns

The instruction the orchestrator gives an apply turn SHALL state whether the turn
is the initial implementation or a follow-up to review feedback. An initial apply
turn SHALL be told to implement the change tasks and archive the change. A
follow-up apply turn SHALL be told to address the reviewer feedback and to
archive only when an active OpenSpec change still remains, so an already-archived
change is not archived again.

#### Scenario: Initial apply instruction archives

- **WHEN** the orchestrator dispatches an initial apply turn
- **THEN** its instruction tells the agent to implement the change tasks and run
  `openspec archive`

#### Scenario: Follow-up instruction addresses review feedback

- **WHEN** the orchestrator dispatches an apply turn for a new review in
  IMPLEMENTING
- **THEN** its instruction tells the agent to address that reviewer feedback and
  names the feedback it must answer

#### Scenario: An archived change is not archived again

- **WHEN** a follow-up apply turn runs after the OpenSpec change has already been
  archived
- **THEN** its instruction tells the agent to commit the requested changes
  without archiving the change again

#### Scenario: An active change is still archived by a follow-up

- **WHEN** a follow-up apply turn finishes an active OpenSpec change
- **THEN** its instruction tells the agent to archive the change in its final
  commit
