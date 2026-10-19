# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow pull request title summarizes its change

When the orchestrator creates the draft pull request for a workflow, its title
SHALL be a Conventional Commit subject of the form `<type>(<scope>): <summary>`
deduced from the issue context, and SHALL NOT be a generated marker that repeats
the issue number.

#### Scenario: Created pull request title summarizes its change

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the title of the created draft pull request is a Conventional Commit
  subject whose summary is the compacted issue title

#### Scenario: Type is deduced from the issue labels

- **WHEN** the issue carries a label naming a change type (for example `bug`)
- **THEN** the created draft pull request's title begins with the corresponding
  type (for example `fix`)

#### Scenario: Label matching is case-insensitive

- **WHEN** the issue carries the type label in a different case (for example
  `Bug`)
- **THEN** the created draft pull request's title still begins with the
  corresponding type

#### Scenario: Default type applies

- **WHEN** neither the issue title nor the issue labels name a Conventional
  Commit type
- **THEN** the created draft pull request's title begins with `feat`

#### Scenario: Already-conventional issue title is preserved

- **WHEN** the issue title already begins with a Conventional Commit prefix
- **THEN** the created draft pull request's title keeps that type, and its scope
  when present, and uses the remaining title as the summary

#### Scenario: A prefix with an unrecognized type is not a Conventional Commit prefix

- **WHEN** the issue title begins with a word before the colon that is not one of
  the project's Conventional Commit types
- **THEN** the created draft pull request's title does not keep that prefix and
  its type is deduced from the issue's labels instead

#### Scenario: Summary is compacted as much as possible to the subject limit

- **WHEN** the issue title is longer than the project's commit-subject limit
- **THEN** the created draft pull request's title normalizes the summary (trims
  it, collapses its whitespace, drops a trailing period, and drops any stale
  trailing ellipsis) and shortens it at a word boundary so it stays under the
  limit, ending the shortened summary with a single ellipsis and never rewriting
  its words

#### Scenario: Title does not repeat the issue number

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the created draft pull request's title carries no generated
  `OpenSpec change for issue #<n>` marker

#### Scenario: Merging keeps the conventional subject

- **WHEN** a workflow pull request titled with a Conventional Commit subject is
  squash-merged into the host's default branch
- **THEN** the resulting commit subject is that Conventional Commit subject

## ADDED Requirements

### Requirement: Workflow pull request title parts are deduced and compacted

The `type` and optional `scope` of the created title SHALL come from an issue
title already beginning with one of the project's Conventional Commit types
(`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`);
otherwise the `type` SHALL come from the issue's labels, matched
case-insensitively and defaulting to `feat`, with no scope. The `summary` SHALL be
the issue title compacted to the project's 72-character commit-subject limit,
keeping the author's words.

#### Scenario: The recognized types are the project's Conventional Commit types

- **WHEN** an issue title begins with a type that is one of the project's
  Conventional Commit types
- **THEN** the created draft pull request's title keeps that type

#### Scenario: No scope is taken from the issue labels

- **WHEN** the issue title is not already conventional and the issue's labels
  name a type
- **THEN** the created draft pull request's title carries no scope

#### Scenario: A stale ellipsis is replaced rather than repeated

- **WHEN** the issue title already ends with an ellipsis left by an earlier
  compaction and is still longer than the limit
- **THEN** the created draft pull request's title drops that ellipsis before
  measuring and ends the shortened summary with a single ellipsis, not two

### Requirement: Pull request title is reconciled with the applied outcome

After an apply turn finishes and its commits are published, and before the
workflow advances, the orchestrator SHALL derive the applied type and optional
scope from the implementation Conventional Commit subjects that turn added, and
update the pull request title, keeping its summary, when the agreed type or
scope differs. A scope is adopted only with an agreed type and a single agreed
scope; otherwise it comes only from a conventional issue title, never invented.

#### Scenario: Applied outcome changes the type

- **WHEN** the apply turn's implementation subjects agree on a Conventional
  Commit type different from the deduced one
- **THEN** the orchestrator updates the pull request title to the applied type
  before the workflow advances

#### Scenario: Applied outcome determines the scope

- **WHEN** the apply turn's implementation subjects agree on a Conventional
  Commit type and the subjects that carry a scope all carry the same scope
- **THEN** the orchestrator updates the pull request title to use that scope,
  replacing a scope deduced from the issue title when the two differ

#### Scenario: Reconciled title keeps its summary

- **WHEN** the orchestrator reconciles the pull request title with the applied
  type or scope
- **THEN** the title keeps the summary it already carried, changing only its type
  and scope

#### Scenario: Several applied scopes keep the deduced scope

- **WHEN** the apply turn's implementation subjects carry more than one
  Conventional Commit scope
- **THEN** the orchestrator keeps the deduced scope and reconciles only the type
  the subjects agree on

#### Scenario: An outcome without a scope keeps the deduced scope

- **WHEN** the issue title brought a scope into the created title and the apply
  turn's implementation subjects agree on a type but none carries a scope
- **THEN** the orchestrator reconciles the type and keeps the scope deduced from
  the issue title

#### Scenario: No scope is invented

- **WHEN** neither the issue title nor the applied commits make a scope clear
- **THEN** the pull request title carries no scope

#### Scenario: Ambiguous outcome keeps the deduced title

- **WHEN** the apply turn's commits do not agree on a type, or carry no
  Conventional Commit subject
- **THEN** the orchestrator leaves the deduced title unchanged

#### Scenario: A failed outcome read keeps the deduced title

- **WHEN** reading the apply turn's commit subjects fails
- **THEN** the orchestrator leaves the deduced title unchanged and still advances
  the workflow

#### Scenario: A prefix with an unrecognized type is not an applied subject

- **WHEN** the apply turn's commits carry a `word:`-style prefix whose word is
  not one of the project's Conventional Commit types
- **THEN** the orchestrator does not derive the applied type from it

#### Scenario: A title that does not parse is left unchanged

- **WHEN** the current pull request title does not parse as a recognized
  Conventional Commit subject
- **THEN** the orchestrator leaves the title unchanged

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

### Requirement: Reconciled pull request title stays within the subject limit

When reconciliation applies an applied type or scope, the resulting title SHALL
stay under the project's commit-subject limit of 72 characters (per `AGENTS.md`)
by shortening the kept summary at a word boundary, bounded only in length and
never in its words.

#### Scenario: Reconciled title keeps the subject limit

- **WHEN** applying the applied type or scope would make the subject reach the
  project's commit-subject limit
- **THEN** the orchestrator shortens the kept summary at a word boundary,
  replacing any ellipsis it already carried, so the reconciled title stays under
  the limit
