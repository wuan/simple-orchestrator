# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow pull request title summarizes its change

When the orchestrator creates the draft pull request for a workflow, its title
SHALL be a Conventional Commit subject of the form `<type>(<scope>): <summary>`
deduced from the issue context: the `type` and optional `scope` from an
already-conventional issue title, otherwise the `type` from the issue's labels
(defaulting to `feat`) and no scope, and the `summary` from the issue title
compacted as much as possible to the project's commit-subject limit (under 72
characters, per `AGENTS.md`). The title SHALL NOT be a generated marker that
repeats the issue number.

#### Scenario: Created pull request title summarizes its change

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the title of the created draft pull request is a Conventional Commit
  subject whose summary is the compacted issue title

#### Scenario: Type is deduced from the issue labels

- **WHEN** the issue carries a label naming a change type (for example `bug`)
- **THEN** the created draft pull request's title begins with the corresponding
  type (for example `fix`)

#### Scenario: Default type applies

- **WHEN** neither the issue title nor the issue labels name a Conventional
  Commit type
- **THEN** the created draft pull request's title begins with `feat`

#### Scenario: Already-conventional issue title is preserved

- **WHEN** the issue title already begins with a Conventional Commit prefix
- **THEN** the created draft pull request's title keeps that type, and its scope
  when present, and uses the remaining title as the summary

#### Scenario: Summary is compacted as much as possible to the subject limit

- **WHEN** the issue title is longer than the project's commit-subject limit
- **THEN** the created draft pull request's title normalizes the summary (trims
  it, collapses its whitespace, and drops a trailing period) and shortens it at
  a word boundary so it stays under the limit, without rewriting its words

#### Scenario: Title does not repeat the issue number

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the created draft pull request's title carries no generated
  `OpenSpec change for issue #<n>` marker

#### Scenario: Merging keeps the conventional subject

- **WHEN** a workflow pull request titled with a Conventional Commit subject is
  squash-merged into the host's default branch
- **THEN** the resulting commit subject is that Conventional Commit subject

## ADDED Requirements

### Requirement: Pull request title is reconciled with the applied outcome

After an apply turn finishes and its commits are published, and before the
workflow advances, the orchestrator SHALL derive the applied type and optional
scope from the implementation Conventional Commit subjects that turn added - not
from an earlier propose turn or OpenSpec bookkeeping subjects - and update the
pull request title when it differs. A scope SHALL come only from the issue
context or the applied commits, never invented.

#### Scenario: Applied outcome changes the type

- **WHEN** the apply turn's implementation subjects agree on a Conventional
  Commit type different from the deduced one
- **THEN** the orchestrator updates the pull request title to the applied type
  before the workflow advances

#### Scenario: Applied outcome determines the scope

- **WHEN** the apply turn's implementation subjects that carry a scope all carry
  the same scope
- **THEN** the orchestrator updates the pull request title to use that scope,
  replacing a scope deduced from the issue title when the two differ

#### Scenario: Several applied scopes keep the deduced scope

- **WHEN** the apply turn's implementation subjects carry more than one
  Conventional Commit scope
- **THEN** the orchestrator keeps the deduced scope and reconciles only the type
  the subjects agree on

#### Scenario: No scope is invented

- **WHEN** neither the issue title nor the applied commits make a scope clear
- **THEN** the pull request title carries no scope

#### Scenario: Ambiguous outcome keeps the deduced title

- **WHEN** the apply turn's commits do not agree on a type, or carry no
  Conventional Commit subject
- **THEN** the orchestrator leaves the deduced title unchanged

#### Scenario: Propose commits do not decide the outcome

- **WHEN** the apply turn adds a Conventional Commit subject and the workflow
  branch also carries the propose turn's `docs(openspec)` commits
- **THEN** the orchestrator reconciles from the apply turn's commits only, and
  the propose commits do not force the deduced title to be kept

#### Scenario: OpenSpec bookkeeping commits do not decide the outcome

- **WHEN** an apply turn commits both an implementation subject and an OpenSpec
  bookkeeping subject scoped `openspec` (for example its archive commit)
- **THEN** the orchestrator derives the applied type and scope from the
  implementation subject and does not treat the bookkeeping subject as a
  disagreement

#### Scenario: Title update failure does not fail the workflow

- **WHEN** updating the pull request title fails
- **THEN** the orchestrator reports the failure and still advances the workflow
  to implementing and ready for review
