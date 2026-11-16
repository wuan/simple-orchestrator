# Spec Delta

## ADDED Requirements

### Requirement: The OpenSpec CLI runs on a supported major release

The project SHALL install an OpenSpec CLI release from a supported major in its
workflows and SHALL keep the OpenSpec instruction files in the shared layout
that release produces, refreshing them with `openspec update`, so the CLI, the
validation gate, and the agent's skills agree on one OpenSpec version and the
orchestrator's CLI integration stays compatible.

#### Scenario: CI installs the supported major

- **WHEN** the CI verify job installs the OpenSpec CLI
- **THEN** it installs a 2.x release and `openspec validate --strict --all` and
  `openspec validate --strict --archived` pass under it

#### Scenario: The project carries the shared skills

- **WHEN** the pinned CLI writes its instruction files
- **THEN** the OpenSpec skills live in `.agents/skills/`, with an
  `.agents/skills/.openspec-target` naming the configured tool, and no removed
  `/opsx:*` command files remain

#### Scenario: The orchestrator reads the pinned major

- **WHEN** the orchestrator lists active changes, reads a change's status, or
  validates a change
- **THEN** it parses `openspec list --json`, `openspec status --json`, and
  `openspec validate --strict` from the pinned major without a source change
