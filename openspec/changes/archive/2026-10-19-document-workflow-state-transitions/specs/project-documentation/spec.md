# Spec Delta

## ADDED Requirements

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
