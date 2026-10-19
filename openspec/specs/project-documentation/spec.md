# project-documentation Specification

## Purpose
Keeps the project README's overview diagrams maintainable and renderable by expressing the workflow lifecycle and the system architecture as Mermaid instead of character art.

## Requirements

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

### Requirement: README documents the workflow state machine

Alongside the lifecycle diagram, the README SHALL document the workflow state machine so a reader can tell which transitions are possible from each state, which lifecycle label shows the current state on the pull request, and which action the orchestrator runs for each trigger.

#### Scenario: Every state has a transition reference

- **WHEN** the README's "How it works" section is read
- **THEN** it contains a transition table that lists each workflow state (PROPOSING, READY, IMPLEMENTING, DONE, and FAILED) with the triggers that apply in that state, the state that results, and the action the orchestrator runs

#### Scenario: Phase labels show the current state

- **WHEN** the README explains how the current workflow state is shown
- **THEN** it states that the trigger label is carried by the issue, that the pull request carries the configured lifecycle label for its current phase (`openspec:proposing`, `openspec:ready`, `openspec:implementing`, `openspec:done`, `openspec:failed`), that setting a phase replaces any other phase label, and that the label names are configurable

#### Scenario: Actions name the turn and the host operations

- **WHEN** the transition table describes an action
- **THEN** it names the turn that runs (`propose` or `apply`) and the observable host operations (creating the draft pull request, pushing the branch, posting a comment, marking the pull request ready for review, setting or clearing lifecycle labels), or states that no turn runs

#### Scenario: Terminal, failure, cancellation, and recovery transitions are covered

- **WHEN** a reader looks up how a workflow changes or ends outside the ordinary propose-and-approve path
- **THEN** the table covers merge to DONE, turn and revise-limit failures to FAILED, cancellation that clears the lifecycle labels when the trigger label is removed or the pull request is closed without merge, and recovery of an interrupted or failed workflow

#### Scenario: The diagram and the table do not contradict

- **WHEN** the lifecycle diagram and the transition table are compared
- **THEN** the diagram shows only transitions that the table lists, and the table is the exhaustive reference for states and transitions that the diagram simplifies or omits
