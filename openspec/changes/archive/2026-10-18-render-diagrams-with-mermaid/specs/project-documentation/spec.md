# Spec Delta

## Purpose

Keeps the project README's overview diagrams maintainable and renderable by expressing the workflow lifecycle and the system architecture as Mermaid instead of character art.

## ADDED Requirements

### Requirement: README overview diagrams render as Mermaid

The project README SHALL express its graph-like overview diagrams - the workflow lifecycle and the system architecture - as Mermaid fenced code blocks, so GitHub renders them as diagrams while the source stays editable as text.

#### Scenario: Lifecycle diagram renders as a state diagram

- **WHEN** the README is viewed on GitHub
- **THEN** the workflow lifecycle is drawn as a Mermaid state diagram that keeps the PROPOSING, READY, IMPLEMENTING, and DONE phases and the transitions between them

#### Scenario: Architecture diagram renders as a flowchart

- **WHEN** the README is viewed on GitHub
- **THEN** the system architecture is drawn as a Mermaid flowchart that keeps the poller, workflow engine, decision, sandbox, agent runtime, and repository provider and the edges between them

#### Scenario: Diagram source stays legible as text

- **WHEN** the README is read without a Mermaid renderer
- **THEN** the Mermaid source is legible and the surrounding prose still explains the lifecycle and the architecture

### Requirement: The project-layout listing stays a text block

The README SHALL keep the project-layout listing as a fenced text block, because it is a directory tree rather than a graph and has no faithful Mermaid representation.

#### Scenario: Project layout remains a text listing

- **WHEN** the README is compared with the converted diagrams
- **THEN** the project-layout block is still a text listing and is the only character drawing left in the README
